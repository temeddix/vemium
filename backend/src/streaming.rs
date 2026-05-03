//! WebSocket wire protocol for room event streams.
//!
//! All messages a client receives over `/v1/rooms/:id/stream` are JSON
//! encodings of [`WsEvent`]. The `type` discriminator lets the frontend
//! pattern-match on a single union.
//!
//! ## Two layers: drafts and messages
//!
//! - **Drafts** are purely transient. While a turn is being produced the
//!   server emits per-token `Draft*` frames so the UI can render a "writing"
//!   card. Drafts are not persisted; if a client reconnects mid-turn, the
//!   prefix it missed is gone — the draft simply renders cut-off, starting
//!   from whatever tokens arrive after subscribe.
//! - **Messages** are authoritative. Once a turn finishes, the orchestrator
//!   inserts a single `room_events` row containing the final text, the
//!   reasoning trace, and every tool call from that turn (inline). It then
//!   emits exactly one [`WsEvent::MessageAdded`] frame. The frontend uses
//!   that frame to retire the matching draft and append the message to the
//!   chat list.
//!
//! Sequence numbers live on messages only — they're the unit of truth that
//! survives reconnects.
//!
//! ## Fan-out: [`RoomStream`]
//!
//! Producers write events through one [`RoomStream`] per room; subscribers
//! (one per connected WebSocket) read from a [`RoomReceiver`]. Each
//! subscriber owns its own bounded mpsc pair split into two priority lanes:
//!
//! - **Lifecycle** — small buffer; if full, the subscriber is dropped so
//!   the client reconnects from a fresh snapshot. Use for events whose
//!   loss desyncs the UI (snapshot, room status, draft start / tool start
//!   / tool complete / fail, message added, report start / complete).
//! - **Tokens** — large buffer; if full, the token is dropped silently and
//!   the subscription stays alive. Use for ephemeral deltas (`DraftText`,
//!   `DraftReasoning`, `ReportToken`).
//!
//! Each new subscriber receives, immediately after subscribing, a
//! [`WsEvent::DraftStarted`] frame for every turn currently in flight on
//! the room (metadata only — no content backfill). That gives late
//! subscribers a header to attach incoming tokens to.

use crate::models::{
  ReportStatus, RoomEvent, RoomReport, RoomStatus, RoomView,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::mpsc;
use uuid::Uuid;

/// Per-subscriber lifecycle queue depth. A connected WebSocket should drain
/// these almost instantly; if more than this many lifecycle frames pile up
/// the client is hopelessly behind and gets dropped to force a reconnect.
const LIFECYCLE_BUFFER: usize = 128;

/// Per-subscriber token queue depth. Sized to absorb several turns' worth
/// of token deltas so brief WebSocket stalls don't drop tokens.
const TOKEN_BUFFER: usize = 4096;

struct Subscription {
  lifecycle: mpsc::Sender<WsEvent>,
  tokens: mpsc::Sender<WsEvent>,
}

/// Receiving end handed to one WebSocket connection. The handler awaits
/// both lanes with a `biased` `select!` so lifecycle frames are never
/// queued behind a backlog of token deltas.
pub struct RoomReceiver {
  pub lifecycle: mpsc::Receiver<WsEvent>,
  pub tokens: mpsc::Receiver<WsEvent>,
}

/// Metadata kept for an in-flight turn so newly-connecting subscribers can
/// be told which agent / kind a draft belongs to even though the original
/// `DraftStarted` was sent before they joined.
#[derive(Clone)]
struct DraftMeta {
  agent: String,
  kind: TurnKind,
}

/// Fan-out registry: producers call [`RoomStream::send`], every connected
/// subscriber receives a clone on the appropriate lane.
#[derive(Default)]
pub struct RoomStream {
  inner: Mutex<RoomStreamInner>,
}

#[derive(Default)]
struct RoomStreamInner {
  subscribers: Vec<Subscription>,
  /// Currently-streaming turns keyed by `TurnId`. Populated on
  /// [`WsEvent::DraftStarted`], drained on [`WsEvent::MessageAdded`] /
  /// [`WsEvent::DraftFailed`]. Replayed for new subscribers so they always
  /// see a header for in-flight turns.
  active_drafts: HashMap<TurnId, DraftMeta>,
}

impl RoomStream {
  pub fn new() -> Self {
    Self::default()
  }

  /// Adds a new subscription and immediately enqueues a [`DraftStarted`]
  /// frame for each turn currently in flight, so a client that connects
  /// mid-stream still has a header to render incoming tokens under.
  pub fn subscribe(&self) -> RoomReceiver {
    let (lifecycle_tx, lifecycle_rx) = mpsc::channel(LIFECYCLE_BUFFER);
    let (tokens_tx, tokens_rx) = mpsc::channel(TOKEN_BUFFER);

    {
      let mut inner = self.lock();
      // Replay metadata for any in-flight drafts. We push directly into
      // the new sender (which is empty and large enough that try_send
      // never fails here) before exposing it to other producers.
      for (turn_id, meta) in inner.active_drafts.iter() {
        let _ = lifecycle_tx.try_send(WsEvent::DraftStarted {
          turn_id: turn_id.clone(),
          agent: meta.agent.clone(),
          kind: meta.kind,
        });
      }
      inner.subscribers.push(Subscription {
        lifecycle: lifecycle_tx,
        tokens: tokens_tx,
      });
    }

    RoomReceiver {
      lifecycle: lifecycle_rx,
      tokens: tokens_rx,
    }
  }

  /// Routes `event` to every live subscriber on the lane its priority
  /// dictates and updates the active-draft registry as a side effect.
  ///
  /// A failed lifecycle send drops the subscriber outright; a failed token
  /// send keeps the subscriber but loses the delta.
  pub fn send(&self, event: WsEvent) {
    let mut inner = self.lock();
    inner.update_active_drafts(&event);

    if event.is_token() {
      inner.subscribers.retain(|sub| !sub.tokens.is_closed());
      for sub in inner.subscribers.iter() {
        let _ = sub.tokens.try_send(event.clone());
      }
    } else {
      inner
        .subscribers
        .retain(|sub| sub.lifecycle.try_send(event.clone()).is_ok());
    }
  }

  fn lock(&self) -> std::sync::MutexGuard<'_, RoomStreamInner> {
    self
      .inner
      .lock()
      .unwrap_or_else(|poison| poison.into_inner())
  }
}

impl RoomStreamInner {
  fn update_active_drafts(&mut self, event: &WsEvent) {
    match event {
      WsEvent::DraftStarted {
        turn_id,
        agent,
        kind,
      } => {
        self.active_drafts.insert(
          turn_id.clone(),
          DraftMeta {
            agent: agent.clone(),
            kind: *kind,
          },
        );
      }
      WsEvent::MessageAdded { turn_id, .. }
      | WsEvent::DraftFailed { turn_id, .. } => {
        self.active_drafts.remove(turn_id);
      }
      _ => {}
    }
  }
}

/// Identifier of an in-flight turn, generated by the orchestrator. Used to
/// correlate a draft card with the eventual [`WsEvent::MessageAdded`].
pub type TurnId = String;

/// Identifier of a single tool invocation within a turn. Stable across the
/// matching `DraftToolStarted` / `DraftToolCompleted` pair so the frontend
/// can update the right entry in the draft's tool list.
pub type ToolCallId = String;

/// Identifier of an in-flight report row in the WS stream. While a report
/// is streaming, we use a stable string so the frontend can attach token
/// deltas; the value mirrors the database `id` for finalized reports.
pub type ReportId = String;

/// One frame of the WebSocket wire format. Variants are tagged with `type`
/// in the JSON output, e.g. `{"type":"draftText","turnId":"...","delta":"hi"}`.
///
/// `Snapshot` carries `RoomView` boxed because it dwarfs every other
/// variant in size and would otherwise inflate the per-event allocation
/// for token streams.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WsEvent {
  /// First message after a successful connect. Contains the room's current
  /// settings, the persisted message log, and the list of reports. Drafts
  /// are NOT included; in-flight turns are surfaced separately via the
  /// `DraftStarted` frames replayed on subscribe.
  Snapshot {
    room: Box<RoomView>,
    messages: Vec<RoomEvent>,
    reports: Vec<RoomReport>,
  },

  /// Room lifecycle change: active <-> paused, or terminal failure.
  RoomStatus { status: RoomStatus },

  /// A new turn has started. Subsequent `Draft*` frames with the same
  /// `turnId` belong to this draft until a matching `MessageAdded` /
  /// `DraftFailed` retires it. Replayed to new subscribers for any
  /// turn that is still in flight when they connect.
  DraftStarted {
    turn_id: TurnId,
    agent: String,
    kind: TurnKind,
  },
  /// One token (or partial token) of the draft's natural-language content.
  /// Best-effort: dropped under backpressure rather than dropping the
  /// subscriber.
  DraftText { turn_id: TurnId, delta: String },
  /// One token of the draft's reasoning trace, for models that emit
  /// chain-of-thought separately. Same drop semantics as `DraftText`.
  DraftReasoning { turn_id: TurnId, delta: String },
  /// A tool invocation began as part of this draft. The frontend appends
  /// it to the draft card's tool list keyed by `callId`.
  DraftToolStarted {
    turn_id: TurnId,
    call_id: ToolCallId,
    tool: String,
    args_preview: String,
  },
  /// The matching tool call finished. `ok = false` means it errored; the
  /// output preview is truncated to keep the WS payload compact.
  DraftToolCompleted {
    turn_id: TurnId,
    call_id: ToolCallId,
    tool: String,
    ok: bool,
    output_preview: String,
    duration_ms: u64,
  },
  /// The turn ended in error before producing a finalized message. The
  /// frontend drops the draft and may surface `error` in a toast / log.
  DraftFailed { turn_id: TurnId, error: String },

  /// A finalized message has been persisted. `turnId` identifies the draft
  /// that produced it (so the frontend can retire that card); `message`
  /// carries the authoritative content with reasoning + tool calls inline.
  MessageAdded { turn_id: TurnId, message: RoomEvent },

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

impl WsEvent {
  /// Whether this frame is a per-token streaming delta. Token frames are
  /// dropped under backpressure; every other frame is a lifecycle event
  /// whose loss would leave the UI inconsistent.
  pub fn is_token(&self) -> bool {
    matches!(
      self,
      WsEvent::DraftText { .. }
        | WsEvent::DraftReasoning { .. }
        | WsEvent::ReportToken { .. }
    )
  }
}

/// Categorization of a turn for the UI. Drives the visual treatment (chat
/// bubble vs. leader callout) without leaking transcript-shape details.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnKind {
  /// A debater (low-model persona) speaking.
  AgentChat,
  /// A leader steering note triggered by the periodic evaluation timer or
  /// the `request_leader_decision` tool.
  LeaderNote,
}

/// Builds a fresh, unique [`TurnId`] for a new turn. Wraps a random UUID so
/// no caller has to think about uniqueness.
pub fn new_turn_id() -> TurnId {
  Uuid::new_v4().to_string()
}

/// Builds a [`ReportId`] for an in-flight report. Once the report is
/// persisted, the same string (the row's database id) is used in
/// [`WsEvent::ReportCompleted`].
pub fn report_id_for(database_id: i64) -> ReportId {
  database_id.to_string()
}
