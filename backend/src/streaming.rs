//! WebSocket wire protocol for room event streams.
//!
//! Every frame a client receives over `/v1/rooms/:code/stream` is a JSON
//! [`WsEvent`] with a `type` discriminator. The protocol is intentionally
//! flat: a unified [`WsEvent::RowAdded`] / [`WsEvent::RowDelta`] /
//! [`WsEvent::RowFinished`] triplet handles every row in `room_events`,
//! whether it's a chat bubble, a thinking burst, or a tool inline note.
//!
//! Producers write events through one [`RoomStream`] per room; subscribers
//! (one per connected WebSocket) read from a single bounded mpsc channel.
//! No lane splitting — preserving producer order is more valuable than
//! per-class prioritisation, and the orchestrator never produces fast
//! enough to fill the buffer in practice. If a subscriber falls behind by
//! more than [`BUFFER_DEPTH`] frames the channel is closed and the client
//! is left to reconnect, which then refetches the in-flight rows from the
//! authoritative `room_events` table — including streaming bodies — so no
//! draft state is ever lost.

use crate::models::{
  DebateState, ReportStatus, RoomEvent, RoomReport, RoomState, RoomView,
  RowStatus,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::sync::Mutex;
use tokio::sync::mpsc;

/// Per-subscriber queue depth. Sized to absorb several turns' worth of
/// row deltas without ever back-pressuring the producer; if a subscriber
/// stalls past this, the channel is dropped and the client reconnects
/// from a fresh snapshot.
const BUFFER_DEPTH: usize = 4096;

/// Receiving end handed to one WebSocket connection.
pub struct RoomReceiver {
  pub events: mpsc::Receiver<WsEvent>,
}

/// Fan-out registry: producers call [`RoomStream::send`], every connected
/// subscriber receives a clone on its own channel.
#[derive(Default)]
pub struct RoomStream {
  inner: Mutex<RoomStreamInner>,
}

#[derive(Default)]
struct RoomStreamInner {
  subscribers: Vec<mpsc::Sender<WsEvent>>,
}

impl RoomStream {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn subscribe(&self) -> RoomReceiver {
    let (tx, rx) = mpsc::channel(BUFFER_DEPTH);
    self.lock().subscribers.push(tx);
    RoomReceiver { events: rx }
  }

  /// Routes `event` to every live subscriber. Subscribers whose channel
  /// is full or closed are dropped from the registry; they will reconnect
  /// from snapshot and rejoin.
  pub fn send(&self, event: WsEvent) {
    let mut inner = self.lock();
    inner
      .subscribers
      .retain(|sub| sub.try_send(event.clone()).is_ok());
  }

  fn lock(&self) -> std::sync::MutexGuard<'_, RoomStreamInner> {
    self
      .inner
      .lock()
      .unwrap_or_else(|poison| poison.into_inner())
  }
}

/// Identifier of an in-flight report row in the WS stream. Mirrors the
/// `room_reports.id` once persisted; held as a string so the wire format
/// is stable across the report's pre/post-finalize transition.
pub type ReportId = String;

/// One frame of the WebSocket wire format. Variants are tagged with `type`
/// in the JSON output, e.g. `{"type":"rowDelta","id":42,"contentDelta":"hi"}`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum WsEvent {
  /// First message after a successful connect. Carries the room metadata
  /// plus every persisted row (including any `Streaming` rows still in
  /// flight, so reconnects converge without losing draft content).
  Snapshot {
    room: Box<RoomView>,
    events: Vec<RoomEvent>,
    reports: Vec<RoomReport>,
  },

  /// User-controlled lifecycle gate flipped (active <-> deactivated).
  RoomState { state: RoomState },

  /// Leader-controlled debate gate flipped (running <-> paused).
  DebateState { state: DebateState },

  /// A new row appeared in `room_events`. The full row is sent so the
  /// client can render it without waiting for any deltas. May arrive
  /// already `Done` (e.g. a one-shot user message) or `Streaming`
  /// (the body fills via subsequent `RowDelta` frames).
  RowAdded { event: RoomEvent },

  /// Appends to a streaming row's `content` and/or `detail`. At least
  /// one of the deltas is non-empty.
  RowDelta {
    id: i64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    content_delta: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    detail_delta: String,
  },

  /// The streaming row at `id` reached terminal state. Carries the final
  /// body so clients converge to the authoritative content even if some
  /// deltas were lost to backpressure.
  RowFinished {
    id: i64,
    content: String,
    detail: String,
    status: RowStatus,
    completed_at: DateTime<Utc>,
  },

  /// A periodic leader report has begun streaming.
  ReportStarted { report_id: ReportId, sequence: u64 },
  /// One token of the in-flight report.
  ReportToken { report_id: ReportId, delta: String },
  /// The report finished. The persisted row is replayed via the snapshot on
  /// reconnect; the live event carries enough to render immediately.
  ReportCompleted {
    report_id: ReportId,
    sequence: u64,
    content: String,
    status: ReportStatus,
    completed_at: DateTime<Utc>,
  },
}

/// Builds a [`ReportId`] for an in-flight report. Once the report is
/// persisted, the same string (the row's database id) is used in
/// [`WsEvent::ReportCompleted`].
pub fn report_id_for(database_id: i64) -> ReportId {
  database_id.to_string()
}
