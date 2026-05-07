//! Streaming append-only log over `room_events`.
//!
//! Rows are held entirely in memory while streaming. The database sees them
//! only once: at [`RowHandle::finish`], which does a single INSERT with
//! `completed_at` set. This eliminates zombie `streaming` rows left in the
//! database when the server is forcibly restarted.
//!
//! While in flight each row carries a negative *transient id* (allocated
//! from a process-global counter) so WebSocket clients can correlate
//! `RowAdded` → `RowDelta` → `RowFinished` frames. In-flight rows are
//! also kept in the [`RoomStream`] inflight registry so reconnecting
//! clients receive them in the snapshot and can pick up streaming where
//! it left off.

use crate::app_state::{AppState, RoomHandle};
use crate::db;
use crate::error::ReportError;
use crate::models::{RoomEvent, RoomEventKind};
use crate::streaming::{RoomStream, WsEvent};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use tokio::sync::Mutex;

static NEXT_TRANSIENT_ID: AtomicI64 = AtomicI64::new(-1);

fn alloc_transient_id() -> i64 {
  NEXT_TRANSIENT_ID.fetch_sub(1, Ordering::Relaxed)
}

/// Per-room append-only event log. Cheap to clone; threads through the
/// orchestrator and into every tool that wants to record a row.
#[derive(Clone)]
pub struct EventLog {
  state: AppState,
  room_code: String,
  handle: RoomHandle,
  stream: Arc<RoomStream>,
}

impl EventLog {
  pub fn new(
    state: AppState,
    room_code: String,
    handle: RoomHandle,
    stream: Arc<RoomStream>,
  ) -> Self {
    Self {
      state,
      room_code,
      handle,
      stream,
    }
  }

  /// Opens a new streaming row. No database write happens here; the row
  /// lives in memory until [`RowHandle::finish`] is called. Broadcasts a
  /// `RowAdded` frame with a transient negative id so clients can begin
  /// rendering immediately.
  pub async fn start_row(
    &self,
    kind: RoomEventKind,
    agent: Option<String>,
    initial_content: String,
    initial_detail: String,
  ) -> RowHandle {
    let transient_id = alloc_transient_id();
    let timestamp = Utc::now();
    let event = RoomEvent {
      id: Some(transient_id),
      room_code: self.room_code.clone(),
      sequence: self.handle.allocate_event_sequence(),
      kind,
      agent: agent.clone(),
      content: initial_content.clone(),
      detail: initial_detail.clone(),
      timestamp,
      completed_at: None,
    };
    self.stream.send(WsEvent::RowAdded {
      event: event.clone(),
    });
    self.stream.register_inflight(event.clone());
    RowHandle {
      log: self.clone(),
      transient_id,
      room_code: self.room_code.clone(),
      sequence: event.sequence,
      kind,
      agent,
      timestamp,
      state: Arc::new(Mutex::new(RowState {
        content: initial_content,
        detail: initial_detail,
      })),
      finished: Arc::new(AtomicBool::new(false)),
    }
  }

  /// Inserts a row that is already done (e.g. a user message or a
  /// one-shot inline note). Broadcasts a single `RowAdded` frame with
  /// the real database id.
  pub async fn record_finalized(
    &self,
    kind: RoomEventKind,
    agent: Option<String>,
    content: String,
    detail: String,
  ) -> RoomEvent {
    let timestamp = Utc::now();
    let event = RoomEvent {
      id: None,
      room_code: self.room_code.clone(),
      sequence: self.handle.allocate_event_sequence(),
      kind,
      agent,
      content,
      detail,
      timestamp,
      completed_at: Some(timestamp),
    };
    let stored = db::insert_event(&self.state.db, &event)
      .await
      .report()
      .unwrap_or_else(|| event.clone());
    self.stream.send(WsEvent::RowAdded {
      event: stored.clone(),
    });
    stored
  }
}

struct RowState {
  content: String,
  detail: String,
}

/// Live handle to a streaming row. Cheap to clone — all clones share the
/// same backing state and the same finalization flag. [`finish`] is
/// idempotent: only the first call writes to the database and emits the
/// `RowFinished` frame.
#[derive(Clone)]
pub struct RowHandle {
  log: EventLog,
  /// Negative transient id used in WS frames while the row is in flight.
  transient_id: i64,
  // Fields needed to build the RoomEvent for the DB insert at finish time.
  room_code: String,
  sequence: u64,
  kind: RoomEventKind,
  agent: Option<String>,
  timestamp: DateTime<Utc>,
  state: Arc<Mutex<RowState>>,
  finished: Arc<AtomicBool>,
}

impl RowHandle {
  /// Appends to the row's `content`. No-op if `delta` is empty or the
  /// row is already finished.
  pub async fn append_content(&self, delta: &str) {
    if delta.is_empty() || self.is_finished() {
      return;
    }
    let mut state = self.state.lock().await;
    state.content.push_str(delta);
    self.log.stream.send(WsEvent::RowDelta {
      id: self.transient_id,
      content_delta: delta.to_string(),
      detail_delta: String::new(),
    });
  }

  /// Appends to the row's `detail`. No-op if `delta` is empty or the
  /// row is already finished.
  pub async fn append_detail(&self, delta: &str) {
    if delta.is_empty() || self.is_finished() {
      return;
    }
    let mut state = self.state.lock().await;
    state.detail.push_str(delta);
    self.log.stream.send(WsEvent::RowDelta {
      id: self.transient_id,
      content_delta: String::new(),
      detail_delta: delta.to_string(),
    });
  }

  /// Replaces the row's body verbatim and broadcasts deltas. Used by
  /// tools that only know the final body once their call returns.
  pub async fn replace_body(&self, content: String, detail: String) {
    if self.is_finished() {
      return;
    }
    let mut state = self.state.lock().await;
    let content_delta = diff_suffix(&state.content, &content);
    let detail_delta = diff_suffix(&state.detail, &detail);
    state.content = content;
    state.detail = detail;
    if !content_delta.is_empty() || !detail_delta.is_empty() {
      self.log.stream.send(WsEvent::RowDelta {
        id: self.transient_id,
        content_delta,
        detail_delta,
      });
    }
  }

  /// Persists the row to the database and broadcasts `RowFinished`.
  /// Idempotent across clones — only the first call acts.
  pub async fn finish(&self) {
    if self.finished.swap(true, Ordering::SeqCst) {
      return;
    }
    let completed_at = Utc::now();
    let state = self.state.lock().await;
    let event = RoomEvent {
      id: None,
      room_code: self.room_code.clone(),
      sequence: self.sequence,
      kind: self.kind,
      agent: self.agent.clone(),
      content: state.content.clone(),
      detail: state.detail.clone(),
      timestamp: self.timestamp,
      completed_at: Some(completed_at),
    };
    self.log.stream.deregister_inflight(self.transient_id);
    db::insert_event(&self.log.state.db, &event).await.report();
    self.log.stream.send(WsEvent::RowFinished {
      id: self.transient_id,
      content: state.content.clone(),
      detail: state.detail.clone(),
      completed_at,
    });
  }

  fn is_finished(&self) -> bool {
    self.finished.load(Ordering::SeqCst)
  }
}

/// If `next` extends `prev` (the common streaming case), returns the
/// appended suffix; otherwise returns `next` whole so the client converges
/// even when a tool rewrote its body non-monotonically.
fn diff_suffix(prev: &str, next: &str) -> String {
  next.strip_prefix(prev).unwrap_or(next).to_string()
}
