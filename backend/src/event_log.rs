//! Streaming append-only log over `room_events`.
//!
//! Every persona turn, every tool, and the orchestrator itself produce
//! [`RowHandle`]s through this log. A row is born `Streaming` (via
//! [`EventLog::start_row`]), accumulates content via
//! [`RowHandle::append_content`] / [`RowHandle::append_detail`], and is
//! retired exactly once via [`RowHandle::finish`]. Each call broadcasts a
//! matching WebSocket frame on the room's [`RoomStream`] and persists to
//! the database, so connected clients converge on the live state and
//! reconnects refetch the in-flight body from the table.
//!
//! The handle deliberately does *not* implement `Drop` finalization:
//! callers must explicitly finish their rows so the failure path
//! (`success = false`) is always intentional.

use crate::app_state::{AppState, RoomHandle};
use crate::db;
use crate::error::ReportError;
use crate::models::{RoomEvent, RoomEventKind};
use crate::streaming::{RoomStream, WsEvent};
use chrono::Utc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;

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

  /// Inserts a fresh row in `Streaming` state and broadcasts a `RowAdded`
  /// frame. The returned handle owns the row's lifecycle from here on.
  pub async fn start_row(
    &self,
    kind: RoomEventKind,
    agent: Option<String>,
    initial_content: String,
    initial_detail: String,
  ) -> RowHandle {
    let timestamp = Utc::now();
    let event = RoomEvent {
      id: None,
      room_code: self.room_code.clone(),
      sequence: self.handle.allocate_event_sequence(),
      kind,
      agent,
      content: initial_content.clone(),
      detail: initial_detail.clone(),
      success: false,
      timestamp,
      completed_at: None,
    };
    let stored = db::insert_event(&self.state.db, &event)
      .await
      .report()
      .unwrap_or_else(|| event.clone());
    self.stream.send(WsEvent::RowAdded {
      event: stored.clone(),
    });
    RowHandle {
      log: self.clone(),
      id: stored.id,
      state: Arc::new(Mutex::new(RowState {
        content: initial_content,
        detail: initial_detail,
      })),
      finished: Arc::new(AtomicBool::new(false)),
    }
  }

  /// Inserts a row that is already `Done` (e.g. a user-authored message
  /// or a one-shot inline note that has nothing to stream). Broadcasts a
  /// single `RowAdded` frame; no further deltas will follow.
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
      success: true,
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

/// Live handle to a streaming row. Cheap to clone - all clones share the
/// same backing state, the same database row, and the same finalization
/// flag. `finish` is idempotent: only the first call writes the
/// terminal state and emits the `RowFinished` frame.
#[derive(Clone)]
pub struct RowHandle {
  log: EventLog,
  /// `None` only if the initial insert returned no id (database error
  /// already reported); subsequent operations become no-ops in that case.
  id: Option<i64>,
  state: Arc<Mutex<RowState>>,
  finished: Arc<AtomicBool>,
}

impl RowHandle {
  /// Appends to the row's `content` (the bubble text or breadcrumb
  /// label). No-op if `delta` is empty or the row is already finished.
  pub async fn append_content(&self, delta: &str) {
    if delta.is_empty() || self.is_finished() {
      return;
    }
    let Some(id) = self.id else {
      return;
    };
    let mut state = self.state.lock().await;
    state.content.push_str(delta);
    db::update_event_body(
      &self.log.state.db,
      id,
      &state.content,
      &state.detail,
    )
    .await
    .report();
    self.log.stream.send(WsEvent::RowDelta {
      id,
      content_delta: delta.to_string(),
      detail_delta: String::new(),
    });
  }

  /// Appends to the row's `detail` (the click-to-reveal body). No-op if
  /// `delta` is empty or the row is already finished.
  pub async fn append_detail(&self, delta: &str) {
    if delta.is_empty() || self.is_finished() {
      return;
    }
    let Some(id) = self.id else {
      return;
    };
    let mut state = self.state.lock().await;
    state.detail.push_str(delta);
    db::update_event_body(
      &self.log.state.db,
      id,
      &state.content,
      &state.detail,
    )
    .await
    .report();
    self.log.stream.send(WsEvent::RowDelta {
      id,
      content_delta: String::new(),
      detail_delta: delta.to_string(),
    });
  }

  /// Replaces the row's body verbatim and broadcasts the resulting state
  /// as a delta against the previously known content. Used by tools that
  /// only know the final body once the call returns.
  pub async fn replace_body(&self, content: String, detail: String) {
    if self.is_finished() {
      return;
    }
    let Some(id) = self.id else {
      return;
    };
    let mut state = self.state.lock().await;
    let content_delta = diff_suffix(&state.content, &content);
    let detail_delta = diff_suffix(&state.detail, &detail);
    state.content = content;
    state.detail = detail;
    db::update_event_body(
      &self.log.state.db,
      id,
      &state.content,
      &state.detail,
    )
    .await
    .report();
    if !content_delta.is_empty() || !detail_delta.is_empty() {
      self.log.stream.send(WsEvent::RowDelta {
        id,
        content_delta,
        detail_delta,
      });
    }
  }

  /// Finalizes the row, persisting the latest body and stamping
  /// `completed_at`. `success` distinguishes a clean finish from a failure.
  /// Idempotent across clones - only the first caller actually writes the
  /// terminal state.
  pub async fn finish(&self, success: bool) {
    if self.finished.swap(true, Ordering::SeqCst) {
      return;
    }
    let Some(id) = self.id else {
      return;
    };
    let completed_at = Utc::now();
    let state = self.state.lock().await;
    db::finish_event(
      &self.log.state.db,
      id,
      &state.content,
      &state.detail,
      success,
      completed_at,
    )
    .await
    .report();
    self.log.stream.send(WsEvent::RowFinished {
      id,
      content: state.content.clone(),
      detail: state.detail.clone(),
      success,
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
