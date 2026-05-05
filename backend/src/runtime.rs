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
//! 3. **Report tick** ([`run_report_loop`]): on every firing of
//!    `report_schedule_cron`, the high model writes a long-form report
//!    streamed token-by-token into a `room_reports` row.
//! 4. **Wake tick** ([`run_resume_schedule_loop`]): while auto-paused,
//!    waits for the next configured cron time and asks the leader whether
//!    to resume.
//!
//! All loops honor the room's `paused` and `stopped` flags. They observe
//! changes at task-natural boundaries (turn end, timer wake) - nothing is
//! preempted mid-LLM-call.
//!
//! Provider configuration is process-global ([`crate::models::AppSettings`]).
//! The orchestrator snapshots `low`/`high` at the start of each LLM call so
//! a settings update lands at the next turn rather than mid-stream.

use crate::app_state::{AppState, RoomHandle};
use crate::db;
use crate::error::ReportError;
use crate::llm::{
  DebateTurnInputs, NoToolTurnInputs, PauseGateInputs, ResumeGateInputs,
  SteeringTurnInputs, build_chat_client,
};
use crate::models::{
  DebateState, ProviderConfig, ReportStatus, Room, RoomEvent, RoomEventKind,
  RoomState,
};
use crate::python_runner::PythonRunner;
use crate::streaming::{
  ReportId, RoomStream, TurnId, TurnKind, WsEvent, new_turn_id, report_id_for,
};
use crate::tools::do_nothing::{self, DoNothingTool};
use crate::tools::format_tool_inline_note;
use crate::tools::get_inline_note_detail::GetInlineNoteDetailTool;
use crate::tools::leader::RequestLeaderDecisionTool;
use crate::tools::pause_room::{LEADER_AGENT, PauseRoomTool};
use crate::tools::resume_room::ResumeRoomTool;
use crate::workspace::{DebateRoot, RoomWorkspace};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use cron::Schedule;
use rig::agent::{HookAction, PromptHook, ToolCallHookAction};
use rig::completion::CompletionModel;
use rig::message::AssistantContent;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::sleep;

/// Persona definition for one of the rotating debaters.
#[derive(Clone, Copy)]
struct DebatePersona {
  name: &'static str,
  system_prompt: &'static str,
}

const DEBATE_PERSONAS: [DebatePersona; 3] = [
  DebatePersona {
    name: "Researcher",
    system_prompt: include_str!("prompts/researcher.md"),
  },
  DebatePersona {
    name: "Strategist",
    system_prompt: include_str!("prompts/strategist.md"),
  },
  DebatePersona {
    name: "Skeptic",
    system_prompt: include_str!("prompts/skeptic.md"),
  },
];

/// Inline guidance appended to every chat turn's system prompt.
const CHAT_FORMAT_GUARDRAIL: &str =
  include_str!("prompts/chat_format_guardrail.md");

/// Reminder injected into every persona system prompt that consumes the
/// transcript. Explains the inline-note breadcrumb syntax and the
/// `get_inline_note_detail` lookup tool so personas know how to fetch the
/// click-to-reveal body of a breadcrumb when its label is not enough.
const INLINE_NOTE_TOOL_HINT: &str = "Inline-note breadcrumbs in the \
  transcript are tagged `(inline-note #N by Author)`. The visible label is \
  usually enough context, but when you need the full body (e.g. the \
  traceback behind a `Python script run fail` note), call \
  `get_inline_note_detail` with `id=N`.";

/// Inline-note label written before the leader's bubble on a periodic
/// steering tick. The leader's `agent` field is always plain
/// [`LEADER_AGENT`] now; this breadcrumb is what tells the user this
/// particular bubble is the periodic nudge rather than a debater request
/// or a gate decision.
const STEERING_INLINE_NOTE: &str = "Appeared for steering";
const KICKOFF_INLINE_NOTE: &str = "Opened with plan";
const LEADER_KICKOFF_PROMPT: &str = include_str!("prompts/leader_kickoff.md");
const LEADER_STEERING_PROMPT: &str = include_str!("prompts/leader_steering.md");
const LEADER_REPORT_PROMPT: &str = include_str!("prompts/leader_report.md");
const LEADER_PAUSE_GATE_PROMPT: &str =
  include_str!("prompts/leader_pause_gate.md");
const LEADER_RESUME_GATE_PROMPT: &str =
  include_str!("prompts/leader_resume_gate.md");
const LEADER_PAUSE_GATE_USER_PROMPT: &str =
  include_str!("prompts/leader_pause_gate_user.md");
const LEADER_RESUME_GATE_USER_PROMPT: &str =
  include_str!("prompts/leader_resume_gate_user.md");

const DEFAULT_WAKE_LABEL: &str = "Every hour";

/// On boot, brings every persisted room back online. Rooms in either
/// [`RoomState::Deactivated`] or [`DebateState::Paused`] keep that state -
/// the orchestrator starts but does not advance turns until the matching
/// gate is flipped back.
pub async fn restore_rooms(state: AppState) -> Result<()> {
  let rooms = db::load_all_rooms(&state.db).await?;
  for room in rooms {
    spawn_room(state.clone(), room).await?;
  }
  Ok(())
}

/// Loads (or registers) the room into [`AppState`] and spawns its four
/// background tasks.
pub async fn spawn_room(state: AppState, room: Room) -> Result<()> {
  let room_code = room.code.clone();
  let event_seq = db::max_event_sequence(&state.db, &room_code).await?;
  let report_seq = db::max_report_sequence(&state.db, &room_code).await?;

  let handle = RoomHandle::new(event_seq, report_seq);
  if matches!(room.room_state, RoomState::Deactivated) {
    handle.request_deactivate();
  }
  if matches!(room.debate_state, DebateState::Paused) {
    handle.request_pause_debate();
  }

  {
    let mut rooms = state.rooms.write().await;
    rooms.insert(room_code.clone(), room.clone());
  }
  {
    let mut handles = state.room_handles.write().await;
    handles.insert(room_code.clone(), handle.clone());
  }
  state.ensure_room_stream(&room_code).await;

  let debate_root = DebateRoot::new(&state.data_root);
  let workspace = debate_root
    .workspace_for(&room.code)
    .await
    .context("failed to ensure room workspace")?;

  tokio::spawn(run_debate_loop(
    state.clone(),
    handle.clone(),
    room_code.clone(),
    workspace.clone(),
  ));
  tokio::spawn(run_steering_loop(
    state.clone(),
    handle.clone(),
    room_code.clone(),
  ));
  tokio::spawn(run_report_loop(
    state.clone(),
    handle.clone(),
    room_code.clone(),
  ));
  tokio::spawn(run_resume_schedule_loop(state, handle, room_code));

  Ok(())
}

// -- Debate loop -----------------------------------------------------------

async fn run_debate_loop(
  state: AppState,
  handle: RoomHandle,
  room_code: String,
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
    if handle.is_blocked() {
      handle.pause_notify.notified().await;
      continue;
    }

    let Some(snapshot) = load_room_snapshot(&state, &room_code).await else {
      tracing::warn!(%room_code, "room vanished from state; ending debate loop");
      return;
    };

    let history = match db::load_room_events(&state.db, &room_code).await {
      Ok(value) => value,
      Err(error) => {
        tracing::warn!(%room_code, %error, "failed to load room history");
        tokio::select! {
          _ = sleep(Duration::from_secs(1)) => {}
          _ = handle.stop_notify.notified() => return,
          _ = handle.config_notify.notified() => continue,
        }
        continue;
      }
    };

    if needs_leader_kickoff(&history) {
      if let Err(error) =
        run_leader_kickoff(&state, &handle, &snapshot, &history).await
      {
        tracing::warn!(%room_code, %error, "leader kickoff failed");
      }

      let interval = snapshot.chat_interval_seconds.max(1);
      tokio::select! {
        _ = sleep(Duration::from_secs(interval)) => {}
        _ = handle.stop_notify.notified() => return,
        _ = handle.config_notify.notified() => continue,
      }
      continue;
    }

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
          tracing::warn!(%room_code, %error, "failed convergence halt gate");
        }
      }
      Err(error) => {
        no_further_by_persona.insert(persona.name, false);
        tracing::warn!(%room_code, persona = %persona.name, %error, "chat turn failed");
      }
    }

    let interval = snapshot.chat_interval_seconds.max(1);
    tokio::select! {
      _ = sleep(Duration::from_secs(interval)) => {}
      _ = handle.stop_notify.notified() => return,
      _ = handle.config_notify.notified() => continue,
    }
  }
}

fn needs_leader_kickoff(history: &[RoomEvent]) -> bool {
  !history.iter().any(|event| {
    matches!(
      event.kind,
      RoomEventKind::AgentChat | RoomEventKind::LeaderNote
    )
  })
}

struct ChatTurnOutcome {
  no_further_input: bool,
}

/// Runs one debater turn end-to-end. Builds the [`ChatClient`] for the
/// process-wide low tier and delegates the agent build + stream loop to
/// it; the runtime only sees the final assistant text once the stream
/// completes; per-token deltas flow through the [`DebateHook`] passed in.
async fn run_chat_turn(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
  persona: DebatePersona,
  workspace: RoomWorkspace,
) -> Result<ChatTurnOutcome> {
  let history = db::load_room_events(&state.db, &room.code).await?;
  let history_messages = render_transcript_messages(&history);
  let system_prompt = build_chat_system_prompt(room, persona);
  let workspace_files = list_shared_workspace_files(&workspace).await;
  let user_prompt = build_chat_user_prompt(room, persona, &workspace_files);
  let preamble = build_room_preamble(room);

  let stream = state.ensure_room_stream(&room.code).await;
  let turn_id = new_turn_id();

  stream.send(WsEvent::DraftStarted {
    turn_id: turn_id.clone(),
    agent: persona.name.to_string(),
    kind: TurnKind::AgentChat,
  });

  let runner =
    PythonRunner::new(workspace.clone(), room.python_timeout_seconds);
  let (low, high) = current_provider_configs(state).await;
  let leader_tool = RequestLeaderDecisionTool::new(
    state.clone(),
    room.code.clone(),
    high.clone(),
    preamble,
  );
  let do_nothing_tool = DoNothingTool::new();
  let inline_note_tool =
    GetInlineNoteDetailTool::new(state.clone(), room.code.clone());
  let hook = DebateHook::for_draft(
    turn_id.clone(),
    stream.clone(),
    state.clone(),
    room.code.clone(),
    persona.name.to_string(),
  );
  let recorder = hook.recorder();

  let client =
    build_chat_client(&low).context("failed to construct low-tier client")?;

  let result = client
    .run_debate_turn(DebateTurnInputs {
      system_prompt,
      history: history_messages,
      user_prompt,
      workspace,
      runner,
      leader_tool,
      do_nothing_tool,
      inline_note_tool,
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

  let (reasoning, do_nothing_called) = recorder.snapshot().await;
  let no_further_input = do_nothing_called;

  // When `do_nothing` was called we discard any text the model also
  // produced and retire the draft without persisting a bubble. The hook
  // already emitted the inline-note breadcrumb when the tool returned.
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
  let draft = RoomEvent {
    id: None,
    room_code: room.code.clone(),
    sequence,
    kind: RoomEventKind::AgentChat,
    agent: Some(persona.name.to_string()),
    content: trimmed,
    reasoning,
    detail: String::new(),
    timestamp,
  };
  let event = db::insert_event(&state.db, &draft)
    .await
    .report()
    .unwrap_or_else(|| draft.clone());

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
/// Two distinct uses:
///
/// - **Streaming flows** (debater turn, leader steering): construct via
///   [`DebateHook::for_draft`] with the draft's `turn_id`. The hook
///   forwards `DraftText` deltas live and brackets tool invocations with
///   `DraftToolStarted` / `DraftToolCompleted` so the UI can show a
///   spinner while a tool runs.
/// - **Gate flows** (pause / resume gates): construct via
///   [`DebateHook::for_gate`]. There is no draft bubble in flight, so
///   `Draft*` frames are suppressed.
///
/// In both cases the hook persists one `inline_note` row per tool result
/// (using the per-tool formatter from [`format_tool_inline_note`]) and
/// broadcasts it as a `MessageAdded` lifecycle frame. Reasoning deltas
/// and a `do_nothing_called` flag are accumulated in [`TurnRecorder`] so
/// the orchestrator can finish the turn (or skip the bubble) when the
/// stream drains.
#[derive(Clone)]
pub struct DebateHook {
  /// Some when this hook is attached to a streaming draft. None for
  /// gate-only runs that don't have a draft bubble in flight.
  turn_id: Option<TurnId>,
  stream: Arc<RoomStream>,
  state: AppState,
  room_code: String,
  /// Author label written to inline-note rows for tool calls during this
  /// turn (e.g. the persona's name, or `LEADER_AGENT` for gate runs).
  author: String,
  recorder: Arc<TurnRecorder>,
}

/// Per-turn accumulator owned by both the [`DebateHook`] and the
/// orchestrator. Reasoning deltas append to a string; the
/// `do_nothing_called` flag flips on the first successful `do_nothing`
/// invocation so the runtime can suppress the bubble after the turn.
#[derive(Default)]
pub struct TurnRecorder {
  inner: Mutex<TurnRecorderInner>,
}

#[derive(Default)]
struct TurnRecorderInner {
  reasoning: String,
  do_nothing_called: bool,
}

impl TurnRecorder {
  /// Returns `(reasoning, do_nothing_called)` for this turn. Called once
  /// at turn end after the LLM stream has fully drained.
  pub async fn snapshot(&self) -> (String, bool) {
    let inner = self.inner.lock().await;
    (inner.reasoning.clone(), inner.do_nothing_called)
  }

  pub(crate) async fn append_reasoning(&self, delta: &str) {
    self.inner.lock().await.reasoning.push_str(delta);
  }

  pub(crate) async fn mark_do_nothing(&self) {
    self.inner.lock().await.do_nothing_called = true;
  }
}

impl DebateHook {
  /// Hook attached to a streaming draft. `Draft*` frames flow under the
  /// supplied `turn_id`; tool inline-note rows are persisted as the
  /// model invokes each tool.
  pub fn for_draft(
    turn_id: TurnId,
    stream: Arc<RoomStream>,
    state: AppState,
    room_code: String,
    author: String,
  ) -> Self {
    Self {
      turn_id: Some(turn_id),
      stream,
      state,
      room_code,
      author,
      recorder: Arc::new(TurnRecorder::default()),
    }
  }

  /// Hook attached to a gate run. No draft is in flight, so `Draft*`
  /// frames are suppressed; tool inline-note rows are still persisted
  /// and broadcast as `MessageAdded`.
  pub fn for_gate(
    stream: Arc<RoomStream>,
    state: AppState,
    room_code: String,
    author: String,
  ) -> Self {
    Self {
      turn_id: None,
      stream,
      state,
      room_code,
      author,
      recorder: Arc::new(TurnRecorder::default()),
    }
  }

  pub(crate) fn stream(&self) -> &Arc<RoomStream> {
    &self.stream
  }

  pub(crate) fn turn_id(&self) -> Option<&TurnId> {
    self.turn_id.as_ref()
  }

  pub(crate) fn recorder(&self) -> Arc<TurnRecorder> {
    self.recorder.clone()
  }

  /// Builds an `inline_note` row for a finished tool call, persists it,
  /// and broadcasts it on the room stream so connected clients render it
  /// without a refresh. Best-effort: a missing room handle (room deleted
  /// mid-turn) drops the breadcrumb silently.
  async fn persist_tool_inline_note(
    &self,
    tool_name: &str,
    args: &str,
    result: &str,
    ok: bool,
  ) {
    let handle = {
      let handles = self.state.room_handles.read().await;
      handles.get(&self.room_code).cloned()
    };
    let Some(handle) = handle else {
      return;
    };

    let note = format_tool_inline_note(tool_name, args, result, ok);
    let draft = RoomEvent {
      id: None,
      room_code: self.room_code.clone(),
      sequence: handle.allocate_event_sequence(),
      kind: RoomEventKind::InlineNote,
      agent: Some(self.author.clone()),
      content: note.text,
      reasoning: String::new(),
      detail: note.detail,
      timestamp: Utc::now(),
    };
    let event = db::insert_event(&self.state.db, &draft)
      .await
      .report()
      .unwrap_or_else(|| draft.clone());
    self.stream.send(WsEvent::MessageAdded {
      turn_id: new_turn_id(),
      message: event,
    });
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
    if let Some(turn_id) = &self.turn_id {
      self.stream.send(WsEvent::DraftText {
        turn_id: turn_id.clone(),
        delta: text_delta.to_string(),
      });
    }
    HookAction::cont()
  }

  async fn on_tool_call(
    &self,
    tool_name: &str,
    _tool_call_id: Option<String>,
    _internal_call_id: &str,
    _args: &str,
  ) -> ToolCallHookAction {
    if let Some(turn_id) = &self.turn_id {
      self.stream.send(WsEvent::DraftToolStarted {
        turn_id: turn_id.clone(),
        tool: tool_name.to_string(),
      });
    }
    ToolCallHookAction::cont()
  }

  async fn on_tool_result(
    &self,
    tool_name: &str,
    _tool_call_id: Option<String>,
    _internal_call_id: &str,
    args: &str,
    result: &str,
  ) -> HookAction {
    // Heuristic: rig surfaces tool errors via `Result::Err`, which it then
    // serializes with a recognizable "Tool error:" prefix in the assistant
    // message back to the model. Treat anything else as success.
    let ok = !result.starts_with("Tool error:");

    self
      .persist_tool_inline_note(tool_name, args, result, ok)
      .await;

    if ok && tool_name == do_nothing::NAME {
      self.recorder.mark_do_nothing().await;
    }

    if let Some(turn_id) = &self.turn_id {
      self.stream.send(WsEvent::DraftToolCompleted {
        turn_id: turn_id.clone(),
        tool: tool_name.to_string(),
      });
    }
    HookAction::cont()
  }
}

async fn evaluate_and_maybe_auto_pause(
  state: &AppState,
  _handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, &room.code).await?;
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
    LEADER_PAUSE_GATE_USER_PROMPT,
    &preamble,
    &label,
    &transcript,
  );

  let pause_tool =
    PauseRoomTool::new(state.clone(), room.code.clone(), label.clone());
  let do_nothing_tool = DoNothingTool::new();
  let inline_note_tool =
    GetInlineNoteDetailTool::new(state.clone(), room.code.clone());

  let stream = state.ensure_room_stream(&room.code).await;
  let hook = DebateHook::for_gate(
    stream,
    state.clone(),
    room.code.clone(),
    LEADER_AGENT.to_string(),
  );

  let (_low, high) = current_provider_configs(state).await;
  let client =
    build_chat_client(&high).context("failed to construct high-tier client")?;
  client
    .run_pause_gate_turn(PauseGateInputs {
      system_prompt: format!(
        "{LEADER_PAUSE_GATE_PROMPT}\n\n{INLINE_NOTE_TOOL_HINT}"
      ),
      user_prompt,
      pause_tool,
      do_nothing_tool,
      inline_note_tool,
      hook,
    })
    .await
}

async fn run_resume_schedule_loop(
  state: AppState,
  handle: RoomHandle,
  room_code: String,
) {
  loop {
    if handle.is_stopped() {
      return;
    }

    let Some(room) = load_room_snapshot(&state, &room_code).await else {
      return;
    };

    if !room.auto_pause_when_converged {
      tokio::select! {
        _ = sleep(Duration::from_secs(30)) => {}
        _ = handle.stop_notify.notified() => return,
      }
      continue;
    }

    // Only run the wake gate when the debate is auto-paused. A manual
    // user deactivation overrides this — leave the debate alone, the user
    // will re-activate when they're ready.
    if !handle.is_auto_paused() || handle.is_deactivated() {
      tokio::select! {
        _ = handle.pause_notify.notified() => {}
        _ = handle.stop_notify.notified() => return,
      }
      continue;
    }

    let now = Utc::now();
    let Some(next_tick) = next_cron_tick(&room.resume_schedule_cron, now)
    else {
      tracing::warn!(%room_code, cron = %room.resume_schedule_cron, "unparsable resume cron; skipping wake check");
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
      _ = handle.config_notify.notified() => continue,
    }

    if handle.is_stopped()
      || !handle.is_auto_paused()
      || handle.is_deactivated()
    {
      continue;
    }

    let Some(room) = load_room_snapshot(&state, &room_code).await else {
      return;
    };
    if let Err(error) = evaluate_scheduled_resume(&state, &handle, &room).await
    {
      tracing::warn!(%room_code, %error, "scheduled resume gate failed");
    }
  }
}

async fn evaluate_scheduled_resume(
  state: &AppState,
  _handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, &room.code).await?;
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
    LEADER_RESUME_GATE_USER_PROMPT,
    &preamble,
    &label,
    &transcript,
  );

  let resume_tool = ResumeRoomTool::new(state.clone(), room.code.clone());
  let do_nothing_tool = DoNothingTool::new();
  let inline_note_tool =
    GetInlineNoteDetailTool::new(state.clone(), room.code.clone());

  let stream = state.ensure_room_stream(&room.code).await;
  let hook = DebateHook::for_gate(
    stream,
    state.clone(),
    room.code.clone(),
    LEADER_AGENT.to_string(),
  );

  let (_low, high) = current_provider_configs(state).await;
  let client =
    build_chat_client(&high).context("failed to construct high-tier client")?;
  client
    .run_resume_gate_turn(ResumeGateInputs {
      system_prompt: format!(
        "{LEADER_RESUME_GATE_PROMPT}\n\n{INLINE_NOTE_TOOL_HINT}"
      ),
      user_prompt,
      resume_tool,
      do_nothing_tool,
      inline_note_tool,
      hook,
    })
    .await
}

/// Computes the next firing time of `cron` after `now` using the `cron`
/// crate. The crate expects a 7-field schedule (sec min hour dom mon dow
/// year); the user-facing format is the standard 5 fields, so we wrap it.
fn next_cron_tick(cron: &str, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
  let trimmed = cron.trim();
  if trimmed.split_whitespace().count() != 5 {
    return None;
  }
  let extended = format!("0 {trimmed} *");
  let schedule = Schedule::from_str(&extended).ok()?;
  schedule.after(&now).next()
}

// -- Leader steering -------------------------------------------------------

async fn run_steering_loop(
  state: AppState,
  handle: RoomHandle,
  room_code: String,
) {
  loop {
    let interval = match load_room_snapshot(&state, &room_code).await {
      Some(room) => room.steering_interval_seconds.max(60),
      None => return,
    };

    tokio::select! {
      _ = sleep(Duration::from_secs(interval)) => {}
      _ = handle.stop_notify.notified() => return,
      _ = handle.config_notify.notified() => continue,
    }
    if handle.is_stopped() {
      return;
    }
    if handle.is_blocked() {
      continue;
    }

    let Some(room) = load_room_snapshot(&state, &room_code).await else {
      return;
    };

    if let Err(error) = run_leader_steering(&state, &handle, &room).await {
      tracing::warn!(%room_code, %error, "leader steering failed");
    }
  }
}

async fn run_leader_steering(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, &room.code).await?;
  if history.is_empty() {
    return Ok(()); // nothing to steer yet
  }

  let preamble = build_room_preamble(room);
  let system = format!(
    "{LEADER_STEERING_PROMPT}\n\n{preamble}\n\n{INLINE_NOTE_TOOL_HINT}"
  );
  let transcript = render_transcript_text(&history);
  let user = format!(
    "Here is the recent debate transcript:\n\n{transcript}\n\nIssue \
     your steering note now."
  );

  let stream = state.ensure_room_stream(&room.code).await;
  let turn_id = new_turn_id();

  stream.send(WsEvent::DraftStarted {
    turn_id: turn_id.clone(),
    agent: LEADER_AGENT.to_string(),
    kind: TurnKind::LeaderNote,
  });

  let hook = DebateHook::for_draft(
    turn_id.clone(),
    stream.clone(),
    state.clone(),
    room.code.clone(),
    LEADER_AGENT.to_string(),
  );
  let recorder = hook.recorder();
  let inline_note_tool =
    GetInlineNoteDetailTool::new(state.clone(), room.code.clone());

  let (_low, high) = current_provider_configs(state).await;
  let client =
    build_chat_client(&high).context("failed to construct high-tier client")?;
  let final_text = client
    .run_steering_turn(SteeringTurnInputs {
      system_prompt: system,
      user_prompt: user,
      hook,
      inline_note_tool,
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

  // Persist the inline-note breadcrumb first so the timeline shows the
  // gate context just before the bubble.
  let timestamp = Utc::now();
  let inline_draft = RoomEvent {
    id: None,
    room_code: room.code.clone(),
    sequence: handle.allocate_event_sequence(),
    kind: RoomEventKind::InlineNote,
    agent: Some(LEADER_AGENT.to_string()),
    content: STEERING_INLINE_NOTE.to_string(),
    reasoning: String::new(),
    detail: String::new(),
    timestamp,
  };
  let inline_event = db::insert_event(&state.db, &inline_draft)
    .await
    .report()
    .unwrap_or_else(|| inline_draft.clone());
  stream.send(WsEvent::MessageAdded {
    turn_id: new_turn_id(),
    message: inline_event,
  });

  let (reasoning, _do_nothing_called) = recorder.snapshot().await;
  let bubble_draft = RoomEvent {
    id: None,
    room_code: room.code.clone(),
    sequence: handle.allocate_event_sequence(),
    kind: RoomEventKind::LeaderNote,
    agent: Some(LEADER_AGENT.to_string()),
    content: trimmed,
    reasoning,
    detail: String::new(),
    timestamp,
  };
  let bubble_event = db::insert_event(&state.db, &bubble_draft)
    .await
    .report()
    .unwrap_or_else(|| bubble_draft.clone());

  stream.send(WsEvent::MessageAdded {
    turn_id,
    message: bubble_event,
  });
  Ok(())
}

async fn run_leader_kickoff(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
  history: &[RoomEvent],
) -> Result<()> {
  let preamble = build_room_preamble(room);
  let system =
    format!("{LEADER_KICKOFF_PROMPT}\n\n{preamble}\n\n{INLINE_NOTE_TOOL_HINT}");
  let transcript = render_transcript_text(history);
  let user = if transcript.trim().is_empty() {
    "Start the room with an opening traffic-control note and a concrete plan for the next debate turns."
      .to_string()
  } else {
    format!(
      "The room already has user input before kickoff:\n\n{transcript}\n\nStart with an opening traffic-control note and concrete plan aligned to that input."
    )
  };

  let stream = state.ensure_room_stream(&room.code).await;
  let turn_id = new_turn_id();

  stream.send(WsEvent::DraftStarted {
    turn_id: turn_id.clone(),
    agent: LEADER_AGENT.to_string(),
    kind: TurnKind::LeaderNote,
  });

  let hook = DebateHook::for_draft(
    turn_id.clone(),
    stream.clone(),
    state.clone(),
    room.code.clone(),
    LEADER_AGENT.to_string(),
  );
  let recorder = hook.recorder();
  let inline_note_tool =
    GetInlineNoteDetailTool::new(state.clone(), room.code.clone());

  let (_low, high) = current_provider_configs(state).await;
  let client =
    build_chat_client(&high).context("failed to construct high-tier client")?;
  let final_text = client
    .run_steering_turn(SteeringTurnInputs {
      system_prompt: system,
      user_prompt: user,
      hook,
      inline_note_tool,
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
      error: "leader produced no kickoff text".to_string(),
    });
    return Ok(());
  }

  let timestamp = Utc::now();
  let inline_draft = RoomEvent {
    id: None,
    room_code: room.code.clone(),
    sequence: handle.allocate_event_sequence(),
    kind: RoomEventKind::InlineNote,
    agent: Some(LEADER_AGENT.to_string()),
    content: KICKOFF_INLINE_NOTE.to_string(),
    reasoning: String::new(),
    detail: String::new(),
    timestamp,
  };
  let inline_event = db::insert_event(&state.db, &inline_draft)
    .await
    .report()
    .unwrap_or_else(|| inline_draft.clone());
  stream.send(WsEvent::MessageAdded {
    turn_id: new_turn_id(),
    message: inline_event,
  });

  let (reasoning, _do_nothing_called) = recorder.snapshot().await;
  let bubble_draft = RoomEvent {
    id: None,
    room_code: room.code.clone(),
    sequence: handle.allocate_event_sequence(),
    kind: RoomEventKind::LeaderNote,
    agent: Some(LEADER_AGENT.to_string()),
    content: trimmed,
    reasoning,
    detail: String::new(),
    timestamp,
  };
  let bubble_event = db::insert_event(&state.db, &bubble_draft)
    .await
    .report()
    .unwrap_or_else(|| bubble_draft.clone());

  stream.send(WsEvent::MessageAdded {
    turn_id,
    message: bubble_event,
  });
  Ok(())
}

// -- Leader report ---------------------------------------------------------

/// The report loop fires on every cron tick of `report_schedule_cron`. We
/// re-read the room each iteration so a settings change takes effect at
/// the next firing rather than at restart.
async fn run_report_loop(
  state: AppState,
  handle: RoomHandle,
  room_code: String,
) {
  loop {
    if handle.is_stopped() {
      return;
    }

    let Some(room) = load_room_snapshot(&state, &room_code).await else {
      return;
    };

    let now = Utc::now();
    let Some(next_tick) = next_cron_tick(&room.report_schedule_cron, now)
    else {
      tracing::warn!(
        %room_code,
        cron = %room.report_schedule_cron,
        "unparsable report cron; backing off 5 minutes"
      );
      tokio::select! {
        _ = sleep(Duration::from_secs(300)) => {}
        _ = handle.stop_notify.notified() => return,
        _ = handle.config_notify.notified() => continue,
      }
      continue;
    };

    let wait = (next_tick - now)
      .to_std()
      .unwrap_or_else(|_| Duration::from_secs(1));
    tokio::select! {
      _ = sleep(wait) => {}
      _ = handle.stop_notify.notified() => return,
      _ = handle.config_notify.notified() => continue,
    }
    if handle.is_stopped() {
      return;
    }
    if handle.is_blocked() {
      continue;
    }

    let Some(room) = load_room_snapshot(&state, &room_code).await else {
      return;
    };

    if let Err(error) = run_leader_report(&state, &handle, &room).await {
      tracing::warn!(%room_code, %error, "leader report failed");
    }
  }
}

async fn run_leader_report(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, &room.code).await?;
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
    db::start_report(&state.db, &room.code, sequence, started_at).await?;
  let report_id = report_id_for(report.id);

  let stream = state.ensure_room_stream(&room.code).await;
  stream.send(WsEvent::ReportStarted {
    report_id: report_id.clone(),
    sequence,
  });

  let hook = ReportHook::new(report_id.clone(), stream.clone());

  let (_low, high) = current_provider_configs(state).await;
  let outcome = stream_leader_report(&high, &system, user, hook).await;
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

async fn load_room_snapshot(state: &AppState, room_code: &str) -> Option<Room> {
  let rooms = state.rooms.read().await;
  rooms.get(room_code).cloned()
}

/// Snapshots the process-wide low/high provider configs at the point of
/// call. Cheap (clones the structs); used at the start of every LLM
/// interaction so config changes land cleanly between turns.
pub(crate) async fn current_provider_configs(
  state: &AppState,
) -> (ProviderConfig, ProviderConfig) {
  let settings = state.app_settings.read().await;
  (settings.low.clone(), settings.high.clone())
}

fn build_chat_system_prompt(room: &Room, persona: DebatePersona) -> String {
  format!(
    "{persona_prompt}\n\n{preamble}\n\n{guardrail}\n\n{hint}",
    persona_prompt = persona.system_prompt,
    preamble = build_room_preamble(room),
    guardrail = CHAT_FORMAT_GUARDRAIL,
    hint = INLINE_NOTE_TOOL_HINT,
  )
}

fn build_chat_user_prompt(
  room: &Room,
  persona: DebatePersona,
  workspace_files: &[String],
) -> String {
  let mut prompt = format!(
    "Speak as {name} on the room's topic. Reference prior turns when \
     useful. Keep it short and concrete. The room's pinned context:\n\n\
     Topic: {topic}\nGoal: {goal}",
    name = persona.name,
    topic = room.topic,
    goal = room.goal,
  );
  if !workspace_files.is_empty() {
    prompt.push_str(
      "\n\nShared workspace files (saved by you or other personas; open with \
       `read_file` if relevant):\n",
    );
    for path in workspace_files {
      prompt.push_str("- ");
      prompt.push_str(path);
      prompt.push('\n');
    }
  }
  prompt
}

/// Lists files saved in the room workspace so personas can see what
/// artifacts other turns produced. Boilerplate (the Python project
/// manifest, lockfiles) is filtered out so only meaningful work shows up.
/// Capped to keep the prompt bounded.
async fn list_shared_workspace_files(workspace: &RoomWorkspace) -> Vec<String> {
  const MAX_LISTED: usize = 50;
  const SKIP: &[&str] = &["pyproject.toml", "uv.lock", ".python-version"];
  let files = match workspace.list_files(std::path::Path::new(".")).await {
    Ok(files) => files,
    Err(error) => {
      tracing::warn!(%error, "failed to list workspace files for prompt");
      return Vec::new();
    }
  };
  files
    .into_iter()
    .map(|f| f.relative_path)
    .filter(|path| !SKIP.iter().any(|s| path == s))
    .take(MAX_LISTED)
    .collect()
}

pub(crate) fn build_room_preamble(room: &Room) -> String {
  let mut out = format!("Topic: {}\nGoal: {}", room.topic, room.goal);
  if let Some(instruction) = room.instruction.as_deref()
    && !instruction.trim().is_empty()
  {
    out.push_str("\nInstruction: ");
    out.push_str(instruction);
    out.push_str(
      "\nLanguage policy: The Instruction field is authoritative. If it specifies a response language, always use that language in every user-facing message.",
    );
  }
  out.push_str("\nCurrent time: ");
  out.push_str(&format_transcript_timestamp(Utc::now()));
  out
}

/// Renders persisted messages as the agent's chat history. Each row is
/// folded into one assistant message tagged with timestamp + speaker so a
/// new debater can tell whose turn was whose and when each happened.
fn render_transcript_messages(
  events: &[RoomEvent],
) -> Vec<rig::completion::Message> {
  events
    .iter()
    .map(|event| {
      let body = format_transcript_line(event);
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
    .map(format_transcript_line)
    .collect::<Vec<_>>()
    .join("\n\n")
}

/// Formats one event for the transcript. Chat-bubble kinds (agent / leader
/// / user) get `[timestamp] speaker: content`; inline notes get the body
/// label only with an `(inline-note #N by Author)` marker so a persona can
/// look up the click-to-reveal detail via `get_inline_note_detail`.
fn format_transcript_line(event: &RoomEvent) -> String {
  let timestamp = format_transcript_timestamp(event.timestamp);
  let speaker = event.agent.as_deref().unwrap_or("speaker");
  match event.kind {
    RoomEventKind::InlineNote => {
      let id_marker = match event.id {
        Some(id) => format!("#{id}"),
        None => "#?".to_string(),
      };
      format!(
        "[{timestamp}] (inline-note {id_marker} by {speaker}) {}",
        event.content
      )
    }
    RoomEventKind::AgentChat
    | RoomEventKind::LeaderNote
    | RoomEventKind::UserChat => {
      format!("[{timestamp}] {speaker}: {}", event.content)
    }
  }
}

/// Renders an absolute UTC timestamp in the canonical persona-prompt
/// format `YYYY-MM-DD HH:MM:SS UTC`. Kept in one place so the transcript
/// lines and the system-prompt "Current time" header agree exactly.
pub(crate) fn format_transcript_timestamp(timestamp: DateTime<Utc>) -> String {
  timestamp.format("%Y-%m-%d %H:%M:%S UTC").to_string()
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
