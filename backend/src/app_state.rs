//! Shared application state.
//!
//! [`AppState`] is cloned cheaply (everything inside is `Arc`) and threaded
//! through Axum handlers and the orchestrator alike. It keeps the
//! authoritative in-memory view of the world:
//!
//! - `db`: connection pool to SQLite (durable storage).
//! - `data_root`: filesystem root for room workspaces.
//! - `rooms`: every loaded [`Room`] keyed by id.
//! - `room_streams`: a [`RoomStream`] per room, used to fan out [`WsEvent`]s
//!   to any number of WebSocket subscribers via per-subscriber priority
//!   lanes (lifecycle vs. token).
//! - `room_handles`: a [`RoomHandle`] per room that owns the orchestrator's
//!   pause/stop signals.
//!
//! Access patterns:
//!
//! - The orchestrator reads/writes `rooms[id]` and `room_handles[id]`.
//! - HTTP handlers read `rooms`, push events through `room_streams`, and
//!   toggle the handle's pause flag.
//! - WebSocket handlers subscribe to a [`RoomStream`] for live events.

use crate::models::Room;
use crate::streaming::RoomStream;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tokio::sync::{Notify, RwLock};
use uuid::Uuid;

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
  /// Permanent stop signal. When `true`, the orchestrator finishes its
  /// current turn (if any) and exits. Used by the delete handler.
  pub stopped: Arc<AtomicBool>,
  /// Signal fired when `stopped` flips. Lets pauses break early on
  /// shutdown rather than blocking forever.
  pub stop_notify: Arc<Notify>,
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
      stopped: Arc::new(AtomicBool::new(false)),
      stop_notify: Arc::new(Notify::new()),
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
    self.pause_notify.notify_waiters();
  }

  pub fn request_resume(&self) {
    self.paused.store(false, Ordering::SeqCst);
    self.pause_notify.notify_waiters();
  }

  pub fn request_stop(&self) {
    self.stopped.store(true, Ordering::SeqCst);
    self.stop_notify.notify_waiters();
    // Ensure any thread waiting only on `pause_notify` also wakes up.
    self.pause_notify.notify_waiters();
  }

  pub fn is_paused(&self) -> bool {
    self.paused.load(Ordering::SeqCst)
  }

  pub fn is_stopped(&self) -> bool {
    self.stopped.load(Ordering::SeqCst)
  }
}

#[derive(Clone)]
pub struct AppState {
  pub db: SqlitePool,
  pub data_root: Arc<PathBuf>,
  pub rooms: Arc<RwLock<HashMap<Uuid, Room>>>,
  pub room_streams: Arc<RwLock<HashMap<Uuid, Arc<RoomStream>>>>,
  pub room_handles: Arc<RwLock<HashMap<Uuid, RoomHandle>>>,
}

impl AppState {
  pub fn new(db: SqlitePool, data_root: PathBuf) -> Self {
    Self {
      db,
      data_root: Arc::new(data_root),
      rooms: Arc::new(RwLock::new(HashMap::new())),
      room_streams: Arc::new(RwLock::new(HashMap::new())),
      room_handles: Arc::new(RwLock::new(HashMap::new())),
    }
  }

  /// Returns the room's [`RoomStream`], creating it on first access.
  /// Subscribers persist across orchestrator restarts because the stream
  /// lives in [`AppState`] rather than in the orchestrator task.
  pub async fn ensure_room_stream(&self, room_id: Uuid) -> Arc<RoomStream> {
    {
      let streams = self.room_streams.read().await;
      if let Some(stream) = streams.get(&room_id) {
        return stream.clone();
      }
    }
    let mut streams = self.room_streams.write().await;
    streams
      .entry(room_id)
      .or_insert_with(|| Arc::new(RoomStream::new()))
      .clone()
  }

  /// Tear down all in-memory bookkeeping for a room. Used after delete.
  pub async fn forget_room(&self, room_id: Uuid) {
    {
      let mut rooms = self.rooms.write().await;
      rooms.remove(&room_id);
    }
    {
      let mut streams = self.room_streams.write().await;
      streams.remove(&room_id);
    }
    {
      let mut handles = self.room_handles.write().await;
      handles.remove(&room_id);
    }
  }
}
