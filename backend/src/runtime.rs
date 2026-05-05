//! Per-room orchestration.
//!
//! Starting a room spawns four Tokio tasks:
//!
//! 1. **Debate loop** ([`run_debate_loop`]): the heartbeat. Picks the next
//!    persona, runs one streaming turn through the low-tier model with tool
//!    support, sleeps `chat_interval_seconds`, and repeats forever.
//! 2. **Steering tick** ([`run_steering_loop`]): every
//!    `steering_interval_seconds`, the high model emits a `leader_note`
//!    that compliments / criticizes / redirects the debate.
//! 3. **Report tick** ([`run_report_loop`]): every
//!    `report_interval_seconds`, the high model writes a long-form report
//!    streamed token-by-token into a `room_reports` row.
//! 4. **Wake tick** ([`run_resume_schedule_loop`]): while auto-paused,
//!    waits for the next configured cron time and asks the leader whether
//!    to resume.
//!
//! All three honor the room's `paused` and `stopped` flags. They observe
//! changes at task-natural boundaries (turn end, timer wake) - nothing is
//! preempted mid-LLM-call.
//!
//! ## How streaming + tools are wired
//!
//! Each turn delegates to [`crate::llm::ChatClient`], which adapts the
//! room's [`ProviderConfig`] to one of the supported rig providers. The
//! runtime supplies turn inputs (system prompt, history, hook) and receives
//! the final assistant text once the stream completes; per-token deltas
//! flow through the [`DebateHook`] / [`ReportHook`] passed in.

use crate::app_state::{AppState, RoomHandle};
use crate::db;
use crate::error::ReportError;
use crate::llm::{
  DebateTurnInputs, HaltGateInputs, NoToolTurnInputs, ProceedGateInputs,
  build_chat_client,
};
use crate::models::{
  ProviderConfig, ReportStatus, Room, RoomEvent, RoomEventKind, RoomStatus,
  ToolCallRecord,
};
use crate::python_runner::PythonRunner;
use crate::streaming::{
  ReportId, RoomStream, ToolCallId, TurnId, TurnKind, WsEvent, new_turn_id,
  report_id_for,
};
use crate::tools::do_nothing::DoNothingTool;
use crate::tools::halt_room::{HaltRoomTool, LEADER_HALT_AGENT};
use crate::tools::leader::RequestLeaderDecisionTool;
use crate::tools::proceed_room::{LEADER_PROCEED_AGENT, ProceedRoomTool};
use crate::workspace::{DebateRoot, RoomWorkspace};
use anyhow::{Context, Result};
use chrono::{DateTime, Duration as ChronoDuration, Timelike, Utc};
use rig::agent::{HookAction, PromptHook, ToolCallHookAction};
use rig::completion::CompletionModel;
use rig::message::AssistantContent;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio::time::sleep;
use uuid::Uuid;

/// Persona definition for one of the four rotating debaters.
#[derive(Clone, Copy)]
struct DebatePersona {
  name: &'static str,
  system_prompt: &'static str,
}

const DEBATE_PERSONAS: [DebatePersona; 4] = [
  DebatePersona {
    name: "Data Scavenger",
    system_prompt: include_str!("prompts/data_scavenger.md"),
  },
  DebatePersona {
    name: "Macro Strategist",
    system_prompt: include_str!("prompts/macro_strategist.md"),
  },
  DebatePersona {
    name: "Quant Engineer",
    system_prompt: include_str!("prompts/quant_engineer.md"),
  },
  DebatePersona {
    name: "Compliance Lawyer",
    system_prompt: include_str!("prompts/compliance_lawyer.md"),
  },
];

/// Inline guidance appended to every chat turn's system prompt.
const CHAT_FORMAT_GUARDRAIL: &str =
  include_str!("prompts/chat_format_guardrail.md");

const LEADER_STEERING_AGENT: &str = "Leader (steering)";
const LEADER_STEERING_PROMPT: &str = include_str!("prompts/leader_steering.md");
const LEADER_REPORT_PROMPT: &str = include_str!("prompts/leader_report.md");
const LEADER_HALT_GATE_PROMPT: &str =
  include_str!("prompts/leader_halt_gate.md");
const LEADER_PROCEED_GATE_PROMPT: &str =
  include_str!("prompts/leader_proceed_gate.md");
const LEADER_HALT_GATE_USER_PROMPT: &str =
  include_str!("prompts/leader_halt_gate_user.md");
const LEADER_PROCEED_GATE_USER_PROMPT: &str =
  include_str!("prompts/leader_proceed_gate_user.md");

const DEFAULT_WAKE_LABEL: &str = "Every hour";

/// Tool name personas / leader gates call to opt out of producing a bubble.
const DO_NOTHING_TOOL_NAME: &str = "do_nothing";

/// Maximum bytes emitted in tool args/output previews to the WebSocket.
const PREVIEW_MAX_CHARS: usize = 240;

/// On boot, brings every persisted room back online. Rooms with status
/// `Paused` keep that state - the orchestrator starts but does not advance
/// turns until the user resumes.
pub async fn restore_rooms(state: AppState) -> Result<()> {
  let rooms = db::load_all_rooms(&state.db).await?;
  for room in rooms {
    spawn_room(state.clone(), room).await?;
  }
  Ok(())
}

/// Loads (or registers) the room into [`AppState`] and spawns its three
/// background tasks.
pub async fn spawn_room(state: AppState, room: Room) -> Result<()> {
  let room_id = room.id;
  let event_seq = db::max_event_sequence(&state.db, room_id).await?;
  let report_seq = db::max_report_sequence(&state.db, room_id).await?;

  let handle = RoomHandle::new(event_seq, report_seq);
  if matches!(room.status, RoomStatus::Paused) {
    handle.request_pause();
  }

  {
    let mut rooms = state.rooms.write().await;
    rooms.insert(room_id, room.clone());
  }
  {
    let mut handles = state.room_handles.write().await;
    handles.insert(room_id, handle.clone());
  }
  state.ensure_room_stream(room_id).await;

  let debate_root = DebateRoot::new(state.data_root.as_path());
  let workspace = debate_root
    .workspace_for(&room.slug)
    .await
    .context("failed to ensure room workspace")?;

  tokio::spawn(run_debate_loop(
    state.clone(),
    handle.clone(),
    room_id,
    workspace.clone(),
  ));
  tokio::spawn(run_steering_loop(state.clone(), handle.clone(), room_id));
  tokio::spawn(run_report_loop(state.clone(), handle.clone(), room_id));
  tokio::spawn(run_resume_schedule_loop(state, handle, room_id));

  Ok(())
}

// -- Debate loop -----------------------------------------------------------

async fn run_debate_loop(
  state: AppState,
  handle: RoomHandle,
  room_id: Uuid,
  workspace: RoomWorkspace,
) {
  let mut persona_index: usize = 0;
  let mut no_further_by_persona: HashMap<&'static str, bool> = DEBATE_PERSONAS
    .iter()
    .map(|persona| (persona.name, false))
    .collect();

  loop {
    if handle.is_stopped() {
      return;
    }
    if handle.is_paused() {
      handle.pause_notify.notified().await;
      continue;
    }

    let Some(snapshot) = load_room_snapshot(&state, room_id).await else {
      tracing::warn!(%room_id, "room vanished from state; ending debate loop");
      return;
    };

    let persona = DEBATE_PERSONAS[persona_index % DEBATE_PERSONAS.len()];
    persona_index = persona_index.wrapping_add(1);

    let result =
      run_chat_turn(&state, &handle, &snapshot, persona, workspace.clone())
        .await;

    match result {
      Ok(outcome) => {
        no_further_by_persona.insert(persona.name, outcome.no_further_input);

        if !snapshot.auto_pause_when_converged {
          no_further_by_persona
            .values_mut()
            .for_each(|value| *value = false);
        }

        let everyone_idle = no_further_by_persona.values().all(|v| *v);
        if everyone_idle
          && snapshot.auto_pause_when_converged
          && let Err(error) =
            evaluate_and_maybe_auto_pause(&state, &handle, &snapshot).await
        {
          tracing::warn!(%room_id, %error, "failed convergence halt gate");
        }
      }
      Err(error) => {
        no_further_by_persona.insert(persona.name, false);
        tracing::warn!(%room_id, persona = %persona.name, %error, "chat turn failed");
      }
    }

    let interval = snapshot.chat_interval_seconds.max(1);
    tokio::select! {
      _ = sleep(Duration::from_secs(interval)) => {}
      _ = handle.stop_notify.notified() => return,
    }
  }
}

struct ChatTurnOutcome {
  no_further_input: bool,
}

/// Runs one debater turn end-to-end. Builds the [`ChatClient`] for the
/// room's low-tier provider and delegates the agent build + stream loop to
/// it; the runtime only sees the final assistant text and lifecycle events
/// emitted via the [`DebateHook`].
async fn run_chat_turn(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
  persona: DebatePersona,
  workspace: RoomWorkspace,
) -> Result<ChatTurnOutcome> {
  let history = db::load_room_events(&state.db, room.id).await?;
  let history_messages = render_transcript_messages(&history);
  let system_prompt = build_chat_system_prompt(room, persona);
  let user_prompt = build_chat_user_prompt(room, persona);
  let preamble = build_room_preamble(room);

  let stream = state.ensure_room_stream(room.id).await;
  let turn_id = new_turn_id();

  stream.send(WsEvent::DraftStarted {
    turn_id: turn_id.clone(),
    agent: persona.name.to_string(),
    kind: TurnKind::AgentChat,
  });

  let runner =
    PythonRunner::new(workspace.clone(), room.python_timeout_seconds);
  let leader_tool = RequestLeaderDecisionTool::new(
    state.clone(),
    room.id,
    room.high.clone(),
    preamble,
  );
  let do_nothing_tool =
    DoNothingTool::new(state.clone(), room.id, persona.name.to_string());
  let hook = DebateHook::new(turn_id.clone(), stream.clone());
  let recorder = hook.recorder();

  let client = build_chat_client(&room.low)
    .context("failed to construct low-tier client")?;

  let result = client
    .run_debate_turn(DebateTurnInputs {
      system_prompt,
      history: history_messages,
      user_prompt,
      workspace,
      runner,
      leader_tool,
      do_nothing_tool,
      hook,
    })
    .await;

  let final_text = match result {
    Ok(text) => text,
    Err(error) => {
      stream.send(WsEvent::DraftFailed {
        turn_id,
        error: error.to_string(),
      });
      return Err(error);
    }
  };

  let (reasoning, tool_calls) = recorder.snapshot().await;
  let no_further_input = tool_calls
    .iter()
    .any(|call| call.tool == DO_NOTHING_TOOL_NAME && call.ok);

  // When `do_nothing` was called we discard any text the model also
  // produced and retire the draft without persisting a bubble. The tool
  // already emitted the `InlineNote` itself.
  if no_further_input {
    stream.send(WsEvent::DraftFailed {
      turn_id,
      error: String::new(),
    });
    return Ok(ChatTurnOutcome { no_further_input });
  }

  let trimmed = final_text.trim().to_string();
  if trimmed.is_empty() {
    stream.send(WsEvent::DraftFailed {
      turn_id,
      error: "model produced no text after tool loop".to_string(),
    });
    return Ok(ChatTurnOutcome {
      no_further_input: false,
    });
  }

  let sequence = handle.allocate_event_sequence();
  let timestamp = Utc::now();
  let event = RoomEvent {
    room_id: room.id,
    sequence,
    kind: RoomEventKind::AgentChat,
    agent: Some(persona.name.to_string()),
    content: trimmed,
    reasoning,
    tool_calls,
    timestamp,
  };
  db::insert_event(&state.db, &event).await.report();

  stream.send(WsEvent::MessageAdded {
    turn_id,
    message: event,
  });
  Ok(ChatTurnOutcome { no_further_input })
}

// -- Hook -----------------------------------------------------------------

/// Bridge between Rig's [`PromptHook`] callbacks and our WebSocket /
/// persistence layer. One instance per turn.
///
/// The hook does NOT persist anything per-event. Reasoning deltas and tool
/// invocations are accumulated in [`TurnRecorder`] (shared by `Arc` with
/// the orchestrator); the orchestrator pulls them out at turn end and
/// inserts a single `room_events` row containing the message text plus the
/// inline reasoning + tool calls. The hook's only job is to fan WebSocket
/// `Draft*` frames out to subscribers in real time.
#[derive(Clone)]
pub struct DebateHook {
  turn_id: TurnId,
  stream: Arc<RoomStream>,
  recorder: Arc<TurnRecorder>,
  /// `rig::internal_call_id -> (call_id, tool_name, started_at)` for
  /// in-flight tool calls, so we can correlate results back to starts.
  tool_starts: Arc<Mutex<HashMap<String, ToolStart>>>,
}

#[derive(Clone)]
struct ToolStart {
  call_id: ToolCallId,
  tool: String,
  started_at: Instant,
}

/// Per-turn accumulator owned by both the [`DebateHook`] and the
/// orchestrator. Reasoning deltas append to a string; finished tool calls
/// append to a vec in invocation order.
#[derive(Default)]
pub struct TurnRecorder {
  inner: Mutex<TurnRecorderInner>,
}

#[derive(Default)]
struct TurnRecorderInner {
  reasoning: String,
  tool_calls: Vec<ToolCallRecord>,
}

impl TurnRecorder {
  /// Returns the accumulated `(reasoning, tool_calls)` for this turn.
  /// Called once at turn end after the LLM stream has fully drained.
  pub async fn snapshot(&self) -> (String, Vec<ToolCallRecord>) {
    let inner = self.inner.lock().await;
    (inner.reasoning.clone(), inner.tool_calls.clone())
  }

  pub(crate) async fn append_reasoning(&self, delta: &str) {
    self.inner.lock().await.reasoning.push_str(delta);
  }

  pub(crate) async fn record_tool_call(&self, record: ToolCallRecord) {
    self.inner.lock().await.tool_calls.push(record);
  }
}

impl DebateHook {
  fn new(turn_id: TurnId, stream: Arc<RoomStream>) -> Self {
    Self {
      turn_id,
      stream,
      recorder: Arc::new(TurnRecorder::default()),
      tool_starts: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  pub(crate) fn stream(&self) -> &Arc<RoomStream> {
    &self.stream
  }

  pub(crate) fn turn_id(&self) -> &TurnId {
    &self.turn_id
  }

  pub(crate) fn recorder(&self) -> Arc<TurnRecorder> {
    self.recorder.clone()
  }
}

impl<M> PromptHook<M> for DebateHook
where
  M: CompletionModel + Clone,
{
  async fn on_text_delta(
    &self,
    text_delta: &str,
    _aggregated_text: &str,
  ) -> HookAction {
    self.stream.send(WsEvent::DraftText {
      turn_id: self.turn_id.clone(),
      delta: text_delta.to_string(),
    });
    HookAction::cont()
  }

  async fn on_tool_call(
    &self,
    tool_name: &str,
    _tool_call_id: Option<String>,
    internal_call_id: &str,
    args: &str,
  ) -> ToolCallHookAction {
    let call_id = internal_call_id.to_string();
    self.stream.send(WsEvent::DraftToolStarted {
      turn_id: self.turn_id.clone(),
      call_id: call_id.clone(),
      tool: tool_name.to_string(),
      args_preview: preview(args),
    });
    self.tool_starts.lock().await.insert(
      call_id.clone(),
      ToolStart {
        call_id,
        tool: tool_name.to_string(),
        started_at: Instant::now(),
      },
    );
    ToolCallHookAction::cont()
  }

  async fn on_tool_result(
    &self,
    _tool_name: &str,
    _tool_call_id: Option<String>,
    internal_call_id: &str,
    args: &str,
    result: &str,
  ) -> HookAction {
    let started = self.tool_starts.lock().await.remove(internal_call_id);
    let Some(ToolStart {
      call_id,
      tool,
      started_at,
    }) = started
    else {
      tracing::warn!(
        internal_call_id,
        "tool result without matching start; dropping"
      );
      return HookAction::cont();
    };
    let duration_ms = started_at.elapsed().as_millis() as u64;
    // Heuristic: rig surfaces tool errors via `Result::Err`, which it then
    // serializes with a recognizable "Tool error:" prefix in the assistant
    // message back to the model. Treat anything else as success.
    let ok = !result.starts_with("Tool error:");
    let preview_text = preview(result);
    let args_value: serde_json::Value =
      serde_json::from_str(args).unwrap_or(serde_json::Value::Null);

    let record = ToolCallRecord {
      tool: tool.clone(),
      args: args_value,
      ok,
      output_preview: preview_text.clone(),
      duration_ms,
    };
    self.recorder.record_tool_call(record).await;

    self.stream.send(WsEvent::DraftToolCompleted {
      turn_id: self.turn_id.clone(),
      call_id,
      tool,
      ok,
      output_preview: preview_text,
      duration_ms,
    });
    HookAction::cont()
  }
}

async fn evaluate_and_maybe_auto_pause(
  state: &AppState,
  _handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, room.id).await?;
  if history.is_empty() {
    return Ok(());
  }

  let label = if room.resume_schedule_label.trim().is_empty() {
    DEFAULT_WAKE_LABEL.to_string()
  } else {
    room.resume_schedule_label.clone()
  };

  let preamble = build_room_preamble(room);
  let transcript = render_transcript_text(&history);
  let user_prompt = render_gate_user_prompt(
    LEADER_HALT_GATE_USER_PROMPT,
    &preamble,
    &label,
    &transcript,
  );

  let halt_tool = HaltRoomTool::new(state.clone(), room.id, label.clone());
  let do_nothing_tool =
    DoNothingTool::new(state.clone(), room.id, LEADER_HALT_AGENT.to_string());

  let client = build_chat_client(&room.high)
    .context("failed to construct high-tier client")?;
  client
    .run_halt_gate_turn(HaltGateInputs {
      system_prompt: LEADER_HALT_GATE_PROMPT.to_string(),
      user_prompt,
      halt_tool,
      do_nothing_tool,
    })
    .await
}

async fn run_resume_schedule_loop(
  state: AppState,
  handle: RoomHandle,
  room_id: Uuid,
) {
  loop {
    if handle.is_stopped() {
      return;
    }

    let Some(room) = load_room_snapshot(&state, room_id).await else {
      return;
    };

    if !room.auto_pause_when_converged {
      tokio::select! {
        _ = sleep(Duration::from_secs(30)) => {}
        _ = handle.stop_notify.notified() => return,
      }
      continue;
    }

    if !handle.is_paused() || !handle.is_auto_paused() {
      tokio::select! {
        _ = handle.pause_notify.notified() => {}
        _ = handle.stop_notify.notified() => return,
      }
      continue;
    }

    let now = Utc::now();
    let Some(next_tick) =
      next_supported_cron_tick(&room.resume_schedule_cron, now)
    else {
      tracing::warn!(%room_id, cron = %room.resume_schedule_cron, "unsupported resume cron; skipping wake check");
      tokio::select! {
        _ = sleep(Duration::from_secs(300)) => {}
        _ = handle.stop_notify.notified() => return,
      }
      continue;
    };

    let wait = (next_tick - now)
      .to_std()
      .unwrap_or_else(|_| Duration::from_secs(1));
    tokio::select! {
      _ = sleep(wait) => {}
      _ = handle.pause_notify.notified() => continue,
      _ = handle.stop_notify.notified() => return,
    }

    if handle.is_stopped() || !handle.is_paused() || !handle.is_auto_paused() {
      continue;
    }

    let Some(room) = load_room_snapshot(&state, room_id).await else {
      return;
    };
    if let Err(error) = evaluate_scheduled_resume(&state, &handle, &room).await
    {
      tracing::warn!(%room_id, %error, "scheduled resume gate failed");
    }
  }
}

async fn evaluate_scheduled_resume(
  state: &AppState,
  _handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, room.id).await?;
  if history.is_empty() {
    return Ok(());
  }

  let label = if room.resume_schedule_label.trim().is_empty() {
    DEFAULT_WAKE_LABEL.to_string()
  } else {
    room.resume_schedule_label.clone()
  };

  let preamble = build_room_preamble(room);
  let transcript = render_transcript_text(&history);
  let user_prompt = render_gate_user_prompt(
    LEADER_PROCEED_GATE_USER_PROMPT,
    &preamble,
    &label,
    &transcript,
  );

  let proceed_tool = ProceedRoomTool::new(state.clone(), room.id);
  let do_nothing_tool = DoNothingTool::new(
    state.clone(),
    room.id,
    LEADER_PROCEED_AGENT.to_string(),
  );

  let client = build_chat_client(&room.high)
    .context("failed to construct high-tier client")?;
  client
    .run_proceed_gate_turn(ProceedGateInputs {
      system_prompt: LEADER_PROCEED_GATE_PROMPT.to_string(),
      user_prompt,
      proceed_tool,
      do_nothing_tool,
    })
    .await
}

fn next_supported_cron_tick(
  cron: &str,
  now: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
  let trimmed = cron.trim();
  if trimmed == "*/15 * * * *" {
    return next_every_n_minutes(now, 15);
  }
  if trimmed == "*/30 * * * *" {
    return next_every_n_minutes(now, 30);
  }
  if trimmed == "0 * * * *" {
    return next_every_n_hours(now, 1);
  }
  if trimmed == "0 */3 * * *" {
    return next_every_n_hours(now, 3);
  }
  if trimmed == "0 */6 * * *" {
    return next_every_n_hours(now, 6);
  }

  let parts: Vec<&str> = trimmed.split_whitespace().collect();
  if parts.len() != 5 || parts[2] != "*" || parts[3] != "*" || parts[4] != "*" {
    return None;
  }
  let minute = parts[0].parse::<u32>().ok()?;
  let hour = parts[1].parse::<u32>().ok()?;
  if minute > 59 || hour > 23 {
    return None;
  }
  next_daily_utc(now, hour, minute)
}

fn next_every_n_minutes(
  now: DateTime<Utc>,
  step: u32,
) -> Option<DateTime<Utc>> {
  if step == 0 {
    return None;
  }
  let mut candidate =
    now.with_second(0)?.with_nanosecond(0)? + ChronoDuration::minutes(1);
  loop {
    if candidate.minute().is_multiple_of(step) {
      return Some(candidate);
    }
    candidate += ChronoDuration::minutes(1);
  }
}

fn next_every_n_hours(now: DateTime<Utc>, step: u32) -> Option<DateTime<Utc>> {
  if step == 0 {
    return None;
  }
  let mut candidate =
    now.with_second(0)?.with_nanosecond(0)? + ChronoDuration::minutes(1);
  loop {
    if candidate.minute() == 0 && candidate.hour().is_multiple_of(step) {
      return Some(candidate);
    }
    candidate += ChronoDuration::minutes(1);
  }
}

fn next_daily_utc(
  now: DateTime<Utc>,
  hour: u32,
  minute: u32,
) -> Option<DateTime<Utc>> {
  let today = now
    .with_hour(hour)?
    .with_minute(minute)?
    .with_second(0)?
    .with_nanosecond(0)?;
  if today > now {
    return Some(today);
  }
  Some(today + ChronoDuration::days(1))
}

// -- Leader steering -------------------------------------------------------

async fn run_steering_loop(state: AppState, handle: RoomHandle, room_id: Uuid) {
  loop {
    let interval = match load_room_snapshot(&state, room_id).await {
      Some(room) => room.steering_interval_seconds.max(60),
      None => return,
    };

    tokio::select! {
      _ = sleep(Duration::from_secs(interval)) => {}
      _ = handle.stop_notify.notified() => return,
    }
    if handle.is_stopped() {
      return;
    }
    if handle.is_paused() {
      continue;
    }

    let Some(room) = load_room_snapshot(&state, room_id).await else {
      return;
    };

    if let Err(error) = run_leader_steering(&state, &handle, &room).await {
      tracing::warn!(%room_id, %error, "leader steering failed");
    }
  }
}

async fn run_leader_steering(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, room.id).await?;
  if history.is_empty() {
    return Ok(()); // nothing to steer yet
  }

  let preamble = build_room_preamble(room);
  let system = format!("{LEADER_STEERING_PROMPT}\n\n{preamble}");
  let transcript = render_transcript_text(&history);
  let user = format!(
    "Here is the recent debate transcript:\n\n{transcript}\n\nIssue \
     your steering note now."
  );

  let stream = state.ensure_room_stream(room.id).await;
  let turn_id = new_turn_id();

  stream.send(WsEvent::DraftStarted {
    turn_id: turn_id.clone(),
    agent: LEADER_STEERING_AGENT.to_string(),
    kind: TurnKind::LeaderNote,
  });

  let hook = DebateHook::new(turn_id.clone(), stream.clone());
  let recorder = hook.recorder();

  let client = build_chat_client(&room.high)
    .context("failed to construct high-tier client")?;
  let final_text = client
    .run_steering_turn(NoToolTurnInputs {
      system_prompt: system,
      user_prompt: user,
      hook,
    })
    .await
    .inspect_err(|error| {
      stream.send(WsEvent::DraftFailed {
        turn_id: turn_id.clone(),
        error: error.to_string(),
      });
    })?;

  let trimmed = final_text.trim().to_string();
  if trimmed.is_empty() {
    stream.send(WsEvent::DraftFailed {
      turn_id,
      error: "leader produced no text".to_string(),
    });
    return Ok(());
  }

  let (reasoning, tool_calls) = recorder.snapshot().await;
  let sequence = handle.allocate_event_sequence();
  let timestamp = Utc::now();
  let event = RoomEvent {
    room_id: room.id,
    sequence,
    kind: RoomEventKind::LeaderNote,
    agent: Some(LEADER_STEERING_AGENT.to_string()),
    content: trimmed,
    reasoning,
    tool_calls,
    timestamp,
  };
  db::insert_event(&state.db, &event).await.report();

  stream.send(WsEvent::MessageAdded {
    turn_id,
    message: event,
  });
  Ok(())
}

// -- Leader report ---------------------------------------------------------

async fn run_report_loop(state: AppState, handle: RoomHandle, room_id: Uuid) {
  loop {
    let interval = match load_room_snapshot(&state, room_id).await {
      Some(room) => room.report_interval_seconds.max(60),
      None => return,
    };
    tokio::select! {
      _ = sleep(Duration::from_secs(interval)) => {}
      _ = handle.stop_notify.notified() => return,
    }
    if handle.is_stopped() {
      return;
    }
    if handle.is_paused() {
      continue;
    }

    let Some(room) = load_room_snapshot(&state, room_id).await else {
      return;
    };

    if let Err(error) = run_leader_report(&state, &handle, &room).await {
      tracing::warn!(%room_id, %error, "leader report failed");
    }
  }
}

async fn run_leader_report(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, room.id).await?;
  if history.is_empty() {
    return Ok(());
  }

  let preamble = build_room_preamble(room);
  let system = format!("{LEADER_REPORT_PROMPT}\n\n{preamble}");
  let transcript = render_transcript_text(&history);
  let user = format!(
    "Here is the full debate transcript so far:\n\n{transcript}\n\nWrite \
     the periodic report now."
  );

  let sequence = handle.allocate_report_sequence();
  let started_at = Utc::now();
  let report =
    db::start_report(&state.db, room.id, sequence, started_at).await?;
  let report_id = report_id_for(report.id);

  let stream = state.ensure_room_stream(room.id).await;
  stream.send(WsEvent::ReportStarted {
    report_id: report_id.clone(),
    sequence,
  });

  let hook = ReportHook::new(report_id.clone(), stream.clone());

  let outcome = stream_leader_report(&room.high, &system, user, hook).await;
  let completed_at = Utc::now();

  match outcome {
    Ok(content) => {
      let final_content = content.trim().to_string();
      db::finish_report(
        &state.db,
        report.id,
        &final_content,
        ReportStatus::Done,
        completed_at,
      )
      .await
      .report();
      stream.send(WsEvent::ReportCompleted {
        report_id,
        sequence,
        content: final_content,
        status: ReportStatus::Done,
        completed_at,
      });
      Ok(())
    }
    Err(error) => {
      db::finish_report(
        &state.db,
        report.id,
        "",
        ReportStatus::Failed,
        completed_at,
      )
      .await
      .report();
      stream.send(WsEvent::ReportCompleted {
        report_id,
        sequence,
        content: String::new(),
        status: ReportStatus::Failed,
        completed_at,
      });
      Err(error)
    }
  }
}

async fn stream_leader_report(
  high: &ProviderConfig,
  system_prompt: &str,
  user_prompt: String,
  hook: ReportHook,
) -> Result<String> {
  let client = build_chat_client(high)
    .context("failed to construct high-tier client for report")?;
  client
    .run_report_turn(NoToolTurnInputs {
      system_prompt: system_prompt.to_string(),
      user_prompt,
      hook,
    })
    .await
}

/// Hook for leader-report streaming. Token deltas become `ReportToken`
/// events; tool-call methods are unused (no tools are attached) so they
/// stay at the trait's default no-op implementation.
#[derive(Clone)]
pub struct ReportHook {
  report_id: ReportId,
  stream: Arc<RoomStream>,
}

impl ReportHook {
  fn new(report_id: ReportId, stream: Arc<RoomStream>) -> Self {
    Self { report_id, stream }
  }
}

impl<M> PromptHook<M> for ReportHook
where
  M: CompletionModel + Clone,
{
  async fn on_text_delta(
    &self,
    text_delta: &str,
    _aggregated_text: &str,
  ) -> HookAction {
    self.stream.send(WsEvent::ReportToken {
      report_id: self.report_id.clone(),
      delta: text_delta.to_string(),
    });
    HookAction::cont()
  }
}

// -- Helpers ---------------------------------------------------------------

async fn load_room_snapshot(state: &AppState, room_id: Uuid) -> Option<Room> {
  let rooms = state.rooms.read().await;
  rooms.get(&room_id).cloned()
}

fn build_chat_system_prompt(room: &Room, persona: DebatePersona) -> String {
  format!(
    "{persona_prompt}\n\n{preamble}\n\n{guardrail}",
    persona_prompt = persona.system_prompt,
    preamble = build_room_preamble(room),
    guardrail = CHAT_FORMAT_GUARDRAIL,
  )
}

fn build_chat_user_prompt(room: &Room, persona: DebatePersona) -> String {
  format!(
    "Speak as {name} on the room's topic. Reference prior turns when \
     useful. Keep it short and concrete. The room's pinned context:\n\n\
     Topic: {topic}\nGoal: {goal}",
    name = persona.name,
    topic = room.topic,
    goal = room.goal,
  )
}

fn build_room_preamble(room: &Room) -> String {
  let mut out = format!(
    "Room name: {}\nTopic: {}\nGoal: {}",
    room.name, room.topic, room.goal
  );
  if let Some(instruction) = room.instruction.as_deref()
    && !instruction.trim().is_empty()
  {
    out.push_str("\nInstruction: ");
    out.push_str(instruction);
  }
  if let Some(background) = room.background.as_deref()
    && !background.trim().is_empty()
  {
    out.push_str("\nBackground: ");
    out.push_str(background);
  }
  out
}

/// Renders persisted messages as the agent's chat history. Each row is
/// folded into one assistant message tagged with the speaker name so a new
/// debater can tell whose turn was whose.
fn render_transcript_messages(
  events: &[RoomEvent],
) -> Vec<rig::completion::Message> {
  events
    .iter()
    .map(|event| {
      let speaker = event.agent.as_deref().unwrap_or("speaker");
      let body = format!("{speaker}: {}", event.content);
      let assistant_content = AssistantContent::text(body);
      rig::completion::Message::Assistant {
        id: None,
        content: rig::OneOrMany::one(assistant_content),
      }
    })
    .collect()
}

/// Renders the transcript as a single human-readable string for the leader
/// prompts (which take it as part of a `user` message rather than as a
/// chain of past assistant messages).
fn render_transcript_text(events: &[RoomEvent]) -> String {
  events
    .iter()
    .map(|event| {
      let speaker = event.agent.as_deref().unwrap_or("speaker");
      format!("[{speaker}] {}", event.content)
    })
    .collect::<Vec<_>>()
    .join("\n\n")
}

fn render_gate_user_prompt(
  template: &str,
  preamble: &str,
  schedule_label: &str,
  transcript: &str,
) -> String {
  template
    .replace("{preamble}", preamble)
    .replace("{schedule_label}", schedule_label)
    .replace("{transcript}", transcript)
}

fn preview(text: &str) -> String {
  if text.chars().count() <= PREVIEW_MAX_CHARS {
    return text.to_string();
  }
  let mut out: String = text.chars().take(PREVIEW_MAX_CHARS).collect();
  out.push_str("...");
  out
}

// Workspace dir convenience for the [`AppState`] data root.
trait DataRootExt {
  fn as_path(&self) -> &std::path::Path;
}

impl DataRootExt for Arc<PathBuf> {
  fn as_path(&self) -> &std::path::Path {
    self.as_ref().as_path()
  }
}
