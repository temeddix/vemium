//! Shared application state.
//!
//! [`AppState`] is cloned cheaply (everything inside is `Arc`) and threaded
//! through Axum handlers and the orchestrator alike. It keeps the
//! authoritative in-memory view of the world:
//!
//! - `db`: connection pool to SQLite (durable storage).
//! - `data_root`: filesystem root for room workspaces.
//! - `app_settings`: process-wide tier provider configuration. Saved via
//!   the home-screen Settings page; read by the orchestrator on every LLM
//!   call so a key rotation takes effect at the next turn.
//! - `rooms`: every loaded [`Room`] keyed by its readable code.
//! - `room_streams`: a [`RoomStream`] per room, used to fan out [`WsEvent`]s
//!   to any number of WebSocket subscribers via per-subscriber priority
//!   lanes (lifecycle vs. token).
//! - `room_handles`: a [`RoomHandle`] per room that owns the orchestrator's
//!   pause/stop signals.

use crate::models::{AppSettings, Room};
use crate::streaming::RoomStream;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tokio::sync::{Notify, RwLock};

/// Per-room control plane shared between the orchestrator and the HTTP API.
///
/// The orchestrator polls `paused` and `stopped` at every turn boundary and
/// `await`s on `pause_notify` while paused. The API toggles the flags and
/// then notifies. Keeping this small and lock-free avoids contention when a
/// room is broadcasting tokens at high frequency.
#[derive(Debug, Clone)]
pub struct RoomHandle {
  /// `true` while the room is in the `paused` lifecycle state. The
  /// orchestrator does not start a new turn while this is set.
  pub paused: Arc<AtomicBool>,
  /// Signal fired whenever `paused` changes. The orchestrator awaits this
  /// to wake up from a pause.
  pub pause_notify: Arc<Notify>,
  /// True when the current paused state was initiated by auto-convergence.
  pub auto_paused: Arc<AtomicBool>,
  /// Permanent stop signal. When `true`, the orchestrator finishes its
  /// current turn (if any) and exits. Used by the delete handler.
  pub stopped: Arc<AtomicBool>,
  /// Signal fired when `stopped` flips. Lets pauses break early on
  /// shutdown rather than blocking forever.
  pub stop_notify: Arc<Notify>,
  /// Signal fired when room settings change (e.g. interval edits via the
  /// HTTP API). Lets in-progress sleeps wake early so loops re-read fresh
  /// config instead of blocking on the previous interval value.
  pub config_notify: Arc<Notify>,
  /// Monotonic counter for the next event sequence number for this room.
  /// Seeded from the database on orchestrator startup, then owned in
  /// memory.
  pub next_event_sequence: Arc<AtomicU64>,
  /// Same idea as `next_event_sequence`, scoped to the report stream.
  pub next_report_sequence: Arc<AtomicU64>,
}

impl RoomHandle {
  pub fn new(seed_event_seq: u64, seed_report_seq: u64) -> Self {
    Self {
      paused: Arc::new(AtomicBool::new(false)),
      pause_notify: Arc::new(Notify::new()),
      auto_paused: Arc::new(AtomicBool::new(false)),
      stopped: Arc::new(AtomicBool::new(false)),
      stop_notify: Arc::new(Notify::new()),
      config_notify: Arc::new(Notify::new()),
      next_event_sequence: Arc::new(AtomicU64::new(seed_event_seq + 1)),
      next_report_sequence: Arc::new(AtomicU64::new(seed_report_seq + 1)),
    }
  }

  /// Atomically reserves the next event sequence number.
  pub fn allocate_event_sequence(&self) -> u64 {
    self.next_event_sequence.fetch_add(1, Ordering::SeqCst)
  }

  /// Atomically reserves the next report sequence number.
  pub fn allocate_report_sequence(&self) -> u64 {
    self.next_report_sequence.fetch_add(1, Ordering::SeqCst)
  }

  pub fn request_pause(&self) {
    self.paused.store(true, Ordering::SeqCst);
    self.auto_paused.store(false, Ordering::SeqCst);
    self.pause_notify.notify_waiters();
  }

  pub fn request_auto_pause(&self) {
    self.paused.store(true, Ordering::SeqCst);
    self.auto_paused.store(true, Ordering::SeqCst);
    self.pause_notify.notify_waiters();
  }

  pub fn request_resume(&self) {
    self.paused.store(false, Ordering::SeqCst);
    self.auto_paused.store(false, Ordering::SeqCst);
    self.pause_notify.notify_waiters();
  }

  pub fn request_stop(&self) {
    self.stopped.store(true, Ordering::SeqCst);
    self.stop_notify.notify_waiters();
    // Ensure any thread waiting only on `pause_notify` also wakes up.
    self.pause_notify.notify_waiters();
  }

  /// Wakes any loop that is currently sleeping on a per-room interval so it
  /// reloads the latest config snapshot. Call this after persisting a room
  /// settings update.
  pub fn notify_config_changed(&self) {
    self.config_notify.notify_waiters();
  }

  pub fn is_paused(&self) -> bool {
    self.paused.load(Ordering::SeqCst)
  }

  pub fn is_stopped(&self) -> bool {
    self.stopped.load(Ordering::SeqCst)
  }

  pub fn is_auto_paused(&self) -> bool {
    self.auto_paused.load(Ordering::SeqCst)
  }
}

#[derive(Clone)]
pub struct AppState {
  pub db: SqlitePool,
  pub data_root: Arc<PathBuf>,
  pub app_settings: Arc<RwLock<AppSettings>>,
  pub rooms: Arc<RwLock<HashMap<String, Room>>>,
  pub room_streams: Arc<RwLock<HashMap<String, Arc<RoomStream>>>>,
  pub room_handles: Arc<RwLock<HashMap<String, RoomHandle>>>,
}

impl AppState {
  pub fn new(
    db: SqlitePool,
    data_root: PathBuf,
    app_settings: AppSettings,
  ) -> Self {
    Self {
      db,
      data_root: Arc::new(data_root),
      app_settings: Arc::new(RwLock::new(app_settings)),
      rooms: Arc::new(RwLock::new(HashMap::new())),
      room_streams: Arc::new(RwLock::new(HashMap::new())),
      room_handles: Arc::new(RwLock::new(HashMap::new())),
    }
  }

  /// Returns the room's [`RoomStream`], creating it on first access.
  /// Subscribers persist across orchestrator restarts because the stream
  /// lives in [`AppState`] rather than in the orchestrator task.
  pub async fn ensure_room_stream(&self, room_code: &str) -> Arc<RoomStream> {
    {
      let streams = self.room_streams.read().await;
      if let Some(stream) = streams.get(room_code) {
        return stream.clone();
      }
    }
    let mut streams = self.room_streams.write().await;
    streams
      .entry(room_code.to_string())
      .or_insert_with(|| Arc::new(RoomStream::new()))
      .clone()
  }

  /// Tear down all in-memory bookkeeping for a room. Used after delete.
  pub async fn forget_room(&self, room_code: &str) {
    {
      let mut rooms = self.rooms.write().await;
      rooms.remove(room_code);
    }
    {
      let mut streams = self.room_streams.write().await;
      streams.remove(room_code);
    }
    {
      let mut handles = self.room_handles.write().await;
      handles.remove(room_code);
    }
  }
}
