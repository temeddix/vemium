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
//! - `browser`: [`BrowserRegistry`] holding one isolated Chrome context per
//!   active room. Contexts are opened lazily on the first browser tool call
//!   from a given room and torn down when [`AppState::forget_room`] runs.

use crate::browser::BrowserRegistry;
use crate::models::{AppSettings, Room};
use crate::streaming::RoomStream;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tokio::sync::{Mutex, Notify, RwLock};
use tokio::task::JoinSet;

/// Per-room control plane shared between the orchestrator and the HTTP API.
///
/// Task lifetime is managed externally via [`AppState::room_tasks`]: dropping
/// the room's [`JoinSet`] aborts all its tasks immediately at the next
/// `.await` point. [`RoomHandle`] only carries pause/resume signals and
/// lightweight counters — no stop flag needed.
///
/// Two orthogonal gates feed [`RoomHandle::is_blocked`]:
///
/// - `room_deactivated` is the user-controlled gate (the [`RoomState`]
///   `Active`/`Deactivated` axis). The strongest off-switch in the system:
///   while set the orchestrator is fully halted regardless of debate state.
/// - `debate_paused` is the leader-controlled gate (the [`DebateState`]
///   `Running`/`Paused` axis). Flipped by the `pause_room`/`resume_room`
///   tools when the leader decides to pause or wake the debate.
#[derive(Debug, Clone)]
pub struct RoomHandle {
  /// `true` while the user has deactivated the room. Strongest off-switch.
  pub room_deactivated: Arc<AtomicBool>,
  /// `true` while the leader has paused the debate. Independent of
  /// `room_deactivated`; both must be off for the orchestrator to advance.
  pub debate_paused: Arc<AtomicBool>,
  /// Signal fired whenever any gate (`room_deactivated` /
  /// `debate_paused`) changes. The orchestrator awaits this to wake up.
  pub pause_notify: Arc<Notify>,
  /// Signal fired when room settings change (e.g. interval edits via the
  /// HTTP API). Lets in-progress sleeps wake early so loops re-read fresh
  /// config instead of blocking on the previous interval value.
  pub config_notify: Arc<Notify>,
  /// Signal fired when a user posts a chat message to this room. Wakes the
  /// leader user-chat loop so it can respond immediately.
  pub user_message_notify: Arc<Notify>,
  /// Monotonic counter for the next event sequence number for this room.
  /// Seeded from the database on orchestrator startup, then owned in
  /// memory.
  pub next_event_sequence: Arc<AtomicU64>,
  /// Same idea as `next_event_sequence`, scoped to the report stream.
  pub next_report_sequence: Arc<AtomicU64>,
  /// Set to `true` while a background compaction task is running for this
  /// room. Prevents a second compaction from spawning before the first
  /// finishes. Cleared by the task itself when it completes or errors.
  pub compaction_in_progress: Arc<AtomicBool>,
}

impl RoomHandle {
  pub fn new(seed_event_seq: u64, seed_report_seq: u64) -> Self {
    Self {
      room_deactivated: Arc::new(AtomicBool::new(false)),
      debate_paused: Arc::new(AtomicBool::new(false)),
      pause_notify: Arc::new(Notify::new()),
      config_notify: Arc::new(Notify::new()),
      user_message_notify: Arc::new(Notify::new()),
      next_event_sequence: Arc::new(AtomicU64::new(seed_event_seq + 1)),
      next_report_sequence: Arc::new(AtomicU64::new(seed_report_seq + 1)),
      compaction_in_progress: Arc::new(AtomicBool::new(false)),
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

  /// Flips the user-controlled gate to `Deactivated`. The orchestrator
  /// stops advancing turns regardless of [`DebateState`].
  pub fn request_deactivate(&self) {
    self.room_deactivated.store(true, Ordering::SeqCst);
    self.pause_notify.notify_waiters();
  }

  /// Flips the user-controlled gate back to `Active`. The leader's
  /// `debate_paused` flag (if any) is left untouched so a previously
  /// paused room stays paused after the user re-activates it.
  pub fn request_activate(&self) {
    self.room_deactivated.store(false, Ordering::SeqCst);
    self.pause_notify.notify_waiters();
  }

  /// Leader-side debate pause. Flips [`DebateState`] to `Paused`. The
  /// resume scheduler picks the room up at the next cron tick and asks
  /// the leader whether to wake it.
  pub fn request_pause_debate(&self) {
    self.debate_paused.store(true, Ordering::SeqCst);
    self.pause_notify.notify_waiters();
  }

  /// Leader-side debate resume. Flips [`DebateState`] back to `Running`.
  pub fn request_resume_debate(&self) {
    self.debate_paused.store(false, Ordering::SeqCst);
    self.pause_notify.notify_waiters();
  }

  /// Wakes any loop that is currently sleeping on a per-room interval so it
  /// reloads the latest config snapshot. Call this after persisting a room
  /// settings update.
  pub fn notify_config_changed(&self) {
    self.config_notify.notify_waiters();
  }

  /// Wakes the leader user-chat loop to respond to a new user message.
  /// Uses `notify_one` so the permit is stored if the loop is busy, ensuring
  /// the message is not silently dropped.
  pub fn notify_user_message(&self) {
    self.user_message_notify.notify_one();
  }

  /// True while either gate is engaged. The orchestrator must not advance
  /// turns whenever this returns `true`.
  pub fn is_blocked(&self) -> bool {
    self.is_deactivated() || self.is_debate_paused()
  }

  pub fn is_deactivated(&self) -> bool {
    self.room_deactivated.load(Ordering::SeqCst)
  }

  pub fn is_debate_paused(&self) -> bool {
    self.debate_paused.load(Ordering::SeqCst)
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
  /// Owns the live Tokio tasks for each room. Removing an entry drops the
  /// [`JoinSet`], which aborts all tasks for that room at the next
  /// `.await` point — no cooperative stop flag needed.
  pub room_tasks: Arc<Mutex<HashMap<String, JoinSet<()>>>>,
  /// Cache of model context sizes keyed by `"{base_url}:{model}"`. Populated
  /// lazily on first use; values are stable for the process lifetime since
  /// a model's context length does not change without a settings update.
  pub context_size_cache: Arc<RwLock<HashMap<String, u64>>>,
  /// Per-room Chrome browser contexts. The first browser tool call from a
  /// given room opens an isolated CDP context; rooms cannot interfere with
  /// each other's navigation state. Contexts are torn down from
  /// [`AppState::forget_room`] when a room is deleted.
  pub browser: BrowserRegistry,
}

impl AppState {
  pub fn new(
    db: SqlitePool,
    data_root: PathBuf,
    app_settings: AppSettings,
    browser: BrowserRegistry,
  ) -> Self {
    Self {
      db,
      data_root: Arc::new(data_root),
      app_settings: Arc::new(RwLock::new(app_settings)),
      rooms: Arc::new(RwLock::new(HashMap::new())),
      room_streams: Arc::new(RwLock::new(HashMap::new())),
      room_handles: Arc::new(RwLock::new(HashMap::new())),
      room_tasks: Arc::new(Mutex::new(HashMap::new())),
      context_size_cache: Arc::new(RwLock::new(HashMap::new())),
      browser,
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
  ///
  /// Dropping the [`JoinSet`] aborts all room tasks immediately.
  pub async fn forget_room(&self, room_code: &str) {
    // Drop the JoinSet first — aborts all room tasks.
    self.room_tasks.lock().await.remove(room_code);
    self.browser.forget(room_code).await;
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
