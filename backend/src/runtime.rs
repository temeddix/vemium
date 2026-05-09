//! Per-room orchestration.
//!
//! Starting a room spawns four Tokio tasks:
//!
//! 1. **Debate loop** ([`run_debate_loop`]): the heartbeat. Picks the next
//!    persona, runs one streaming turn through the low-tier model with tool
//!    support, sleeps `chat_interval_seconds`, and repeats forever.
//! 2. **Steering tick** ([`run_steering_loop`]): every
//!    `steering_interval_seconds`, the high model emits a leader turn that
//!    compliments / criticizes / redirects the debate.
//! 3. **Report tick** ([`run_report_loop`]): on every firing of
//!    `report_schedule_cron`, the high model writes a long-form report
//!    streamed token-by-token into a `room_reports` row.
//! 4. **Wake tick** ([`run_resume_schedule_loop`]): while auto-paused,
//!    waits for the next configured cron time and asks the leader whether
//!    to resume.
//!
//! Every row in the room timeline (chat bubbles, thinking bursts, tool
//! inline notes) flows through [`crate::event_log::EventLog`]. Bubble and
//! thinking rows are produced by [`TurnSession`] off the rig stream loop;
//! tool inline notes are produced by each tool from inside its own
//! `call()`. This keeps the orchestrator a thin segmenter and frees the
//! protocol from a separate "draft" concept entirely.

use crate::app_state::{AppState, RoomHandle};
use crate::db;
use crate::error::ReportError;
use crate::event_log::{EventLog, RowHandle};
use crate::llm::{
  DebateTurnInputs, NoToolTurnInputs, ResumeGateInputs, SteeringTurnInputs,
  build_chat_client,
};
use crate::models::{
  DebateState, ProviderConfig, Room, RoomEvent, RoomEventKind, RoomState,
};
use crate::python_runner::PythonRunner;
use crate::streaming::{ReportId, RoomStream, WsEvent, report_id_for};
use crate::tools::do_nothing::DoNothingTool;
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
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::sleep;

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

const CHAT_FORMAT_GUARDRAIL: &str =
  include_str!("prompts/chat_format_guardrail.md");
const PYTHON_STYLE_GUIDE: &str = include_str!("prompts/python_style.md");

/// Reminder injected into every persona system prompt that consumes the
/// transcript. Explains the inline-note breadcrumb syntax and the
/// `get_inline_note_detail` lookup tool.
const INLINE_NOTE_TOOL_HINT: &str = "Inline-note breadcrumbs in the \
  transcript are tagged `(inline-note #N by Author)`. The visible label is \
  usually enough context, but when you need the full body (e.g. the \
  traceback behind a `Python script run fail` note), call \
  `get_inline_note_detail` with `id=N`.";

const STEERING_INLINE_NOTE: &str = "Appeared for steering";
const KICKOFF_INLINE_NOTE: &str = "Opened with plan";
const LEADER_KICKOFF_PROMPT: &str = include_str!("prompts/leader_kickoff.md");
const LEADER_STEERING_PROMPT: &str = include_str!("prompts/leader_steering.md");
const LEADER_REPORT_PROMPT: &str = include_str!("prompts/leader_report.md");
const LEADER_RESUME_GATE_PROMPT: &str =
  include_str!("prompts/leader_resume_gate.md");
const LEADER_RESUME_GATE_USER_PROMPT: &str =
  include_str!("prompts/leader_resume_gate_user.md");

const DEFAULT_WAKE_LABEL: &str = "Every hour";
const THINKING_LABEL: &str = "Thinking";

pub async fn restore_rooms(state: AppState) -> Result<()> {
  let rooms = db::load_all_rooms(&state.db).await?;
  for room in rooms {
    spawn_room(state.clone(), room).await?;
  }
  Ok(())
}

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

// -- Turn session ----------------------------------------------------------

/// Shared per-turn row state. The orchestrator's stream loop and the rig
/// hook both call into this to drive the segmentation between thinking
/// rows and balloon rows. Tool calls cause the active row (if any) to
/// close before the tool runs; the tool produces its own inline-note row
/// out of band.
pub struct TurnSession {
  log: EventLog,
  author: String,
  bubble_kind: RoomEventKind,
  active: Mutex<Option<ActiveRow>>,
}

enum ActiveRow {
  Thinking(RowHandle),
  Bubble(RowHandle),
}

impl TurnSession {
  pub fn new(
    log: EventLog,
    author: String,
    bubble_kind: RoomEventKind,
  ) -> Self {
    Self {
      log,
      author,
      bubble_kind,
      active: Mutex::new(None),
    }
  }

  pub fn log(&self) -> &EventLog {
    &self.log
  }

  pub fn author(&self) -> &str {
    &self.author
  }

  /// Appends to the open thinking row, opening one (and closing any open
  /// bubble) on first call.
  pub async fn append_thinking(&self, delta: &str) {
    if delta.is_empty() {
      return;
    }
    let mut active = self.active.lock().await;
    if let Some(ActiveRow::Thinking(row)) = active.as_ref() {
      row.append_detail(delta).await;
      return;
    }
    if let Some(ActiveRow::Bubble(row)) = active.take() {
      row.finish(true).await;
    }
    let row = self
      .log
      .start_row(
        RoomEventKind::Thinking,
        Some(self.author.clone()),
        THINKING_LABEL.to_string(),
        delta.to_string(),
      )
      .await;
    *active = Some(ActiveRow::Thinking(row));
  }

  /// Appends to the open bubble row, opening one (and closing any open
  /// thinking) on first call.
  pub async fn append_text(&self, delta: &str) {
    if delta.is_empty() {
      return;
    }
    let mut active = self.active.lock().await;
    if let Some(ActiveRow::Bubble(row)) = active.as_ref() {
      row.append_content(delta).await;
      return;
    }
    if let Some(ActiveRow::Thinking(row)) = active.take() {
      row.finish(true).await;
    }
    let row = self
      .log
      .start_row(
        self.bubble_kind,
        Some(self.author.clone()),
        delta.to_string(),
        String::new(),
      )
      .await;
    *active = Some(ActiveRow::Bubble(row));
  }

  /// Closes any open row before a tool call begins, so the tool's
  /// inline-note row appears after the model's pre-tool output.
  pub async fn close_active(&self) {
    let mut active = self.active.lock().await;
    if let Some(row) = active.take() {
      let handle = match row {
        ActiveRow::Thinking(row) | ActiveRow::Bubble(row) => row,
      };
      handle.finish(true).await;
    }
  }

  /// Closes any open row at turn end. Idempotent; safe to call multiple
  /// times. `success` applies only to the in-flight row, if any.
  pub async fn finish(&self, success: bool) {
    let mut active = self.active.lock().await;
    if let Some(row) = active.take() {
      let handle = match row {
        ActiveRow::Thinking(row) | ActiveRow::Bubble(row) => row,
      };
      handle.finish(success).await;
    }
  }
}

// -- Hook -----------------------------------------------------------------

/// Thin bridge between rig's [`PromptHook`] callbacks and the per-turn
/// row segmenter. Tool calls close the open row before the tool runs;
/// each tool then owns its own inline-note row.
#[derive(Clone)]
pub struct DebateHook {
  session: Arc<TurnSession>,
}

impl DebateHook {
  pub fn new(session: Arc<TurnSession>) -> Self {
    Self { session }
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
    self.session.append_text(text_delta).await;
    HookAction::cont()
  }

  async fn on_tool_call(
    &self,
    _tool_name: &str,
    _tool_call_id: Option<String>,
    _internal_call_id: &str,
    _args: &str,
  ) -> ToolCallHookAction {
    self.session.close_active().await;
    ToolCallHookAction::cont()
  }
}

// -- Debate loop -----------------------------------------------------------

async fn run_debate_loop(
  state: AppState,
  handle: RoomHandle,
  room_code: String,
  workspace: RoomWorkspace,
) {
  let mut persona_index: usize = 0;

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
      sleep_until_next_turn(&handle, snapshot.chat_interval_seconds).await;
      if handle.is_stopped() {
        return;
      }
      continue;
    }

    let persona = DEBATE_PERSONAS[persona_index % DEBATE_PERSONAS.len()];
    persona_index = persona_index.wrapping_add(1);

    if let Err(error) =
      run_chat_turn(&state, &handle, &snapshot, persona, workspace.clone())
        .await
    {
      tracing::warn!(%room_code, persona = %persona.name, %error, "chat turn failed");
    }

    sleep_until_next_turn(&handle, snapshot.chat_interval_seconds).await;
    if handle.is_stopped() {
      return;
    }
  }
}

async fn sleep_until_next_turn(handle: &RoomHandle, seconds: u64) {
  let interval = seconds.max(1);
  tokio::select! {
    _ = sleep(Duration::from_secs(interval)) => {}
    _ = handle.stop_notify.notified() => {}
    _ = handle.config_notify.notified() => {}
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

async fn run_chat_turn(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
  persona: DebatePersona,
  workspace: RoomWorkspace,
) -> Result<()> {
  let history = db::load_room_events(&state.db, &room.code).await?;
  let history_messages = render_transcript_messages(&history);
  let system_prompt = build_chat_system_prompt(room, persona);
  let workspace_files = list_shared_workspace_files(&workspace).await;
  let user_prompt = build_chat_user_prompt(room, persona, &workspace_files);
  let preamble = build_room_preamble(room);
  let schedule_label = wake_schedule_label(room);

  let stream = state.ensure_room_stream(&room.code).await;
  let log =
    EventLog::new(state.clone(), room.code.clone(), handle.clone(), stream);
  let session = Arc::new(TurnSession::new(
    log.clone(),
    persona.name.to_string(),
    RoomEventKind::AgentChat,
  ));

  let runner =
    PythonRunner::new(workspace.clone(), room.python_timeout_seconds);
  let (low, high) = current_provider_configs(state).await;
  let leader_tool = RequestLeaderDecisionTool::new(
    state.clone(),
    room.code.clone(),
    high.clone(),
    preamble,
    schedule_label,
    log.clone(),
    persona.name.to_string(),
  );
  let do_nothing_tool =
    DoNothingTool::new(log.clone(), persona.name.to_string());
  let inline_note_tool = GetInlineNoteDetailTool::new(
    state.clone(),
    room.code.clone(),
    log.clone(),
    persona.name.to_string(),
  );

  let client =
    build_chat_client(&low).context("failed to construct low-tier client")?;
  let outcome = client
    .run_debate_turn(DebateTurnInputs {
      system_prompt,
      history: history_messages,
      user_prompt,
      workspace,
      runner,
      leader_tool,
      do_nothing_tool,
      inline_note_tool,
      session: session.clone(),
    })
    .await;

  session.finish(outcome.is_ok()).await;
  outcome.map(|_| ())
}

// -- Resume gate -----------------------------------------------------------

async fn run_resume_schedule_loop(
  state: AppState,
  handle: RoomHandle,
  room_code: String,
) {
  loop {
    if handle.is_stopped() {
      return;
    }
    if !handle.is_debate_paused() || handle.is_deactivated() {
      tokio::select! {
        _ = handle.pause_notify.notified() => {}
        _ = handle.stop_notify.notified() => return,
      }
      continue;
    }

    let Some(room) = load_room_snapshot(&state, &room_code).await else {
      return;
    };

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
      || !handle.is_debate_paused()
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
  handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, &room.code).await?;
  if history.is_empty() {
    return Ok(());
  }

  let label = wake_schedule_label(room);
  let preamble = build_room_preamble(room);
  let transcript = render_transcript_text(&history);
  let user_prompt = render_gate_user_prompt(
    LEADER_RESUME_GATE_USER_PROMPT,
    &preamble,
    &label,
    &transcript,
  );

  let stream = state.ensure_room_stream(&room.code).await;
  let log =
    EventLog::new(state.clone(), room.code.clone(), handle.clone(), stream);
  let session = Arc::new(TurnSession::new(
    log.clone(),
    LEADER_AGENT.to_string(),
    RoomEventKind::LeaderNote,
  ));

  let resume_tool =
    ResumeRoomTool::new(state.clone(), room.code.clone(), log.clone());
  let do_nothing_tool =
    DoNothingTool::new(log.clone(), LEADER_AGENT.to_string());
  let inline_note_tool = GetInlineNoteDetailTool::new(
    state.clone(),
    room.code.clone(),
    log.clone(),
    LEADER_AGENT.to_string(),
  );

  let (_low, high) = current_provider_configs(state).await;
  let client =
    build_chat_client(&high).context("failed to construct high-tier client")?;
  let outcome = client
    .run_resume_gate_turn(ResumeGateInputs {
      system_prompt: format!(
        "{LEADER_RESUME_GATE_PROMPT}\n\n{INLINE_NOTE_TOOL_HINT}"
      ),
      user_prompt,
      resume_tool,
      do_nothing_tool,
      inline_note_tool,
      session: session.clone(),
    })
    .await;
  session.finish(outcome.is_ok()).await;
  outcome
}

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
    return Ok(());
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

  run_leader_turn(state, handle, room, system, user, STEERING_INLINE_NOTE).await
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
    "Start the room with an opening traffic-control note and a concrete plan for the next debate turns.".to_string()
  } else {
    format!(
      "The room already has user input before kickoff:\n\n{transcript}\n\nStart with an opening traffic-control note and concrete plan aligned to that input."
    )
  };

  run_leader_turn(state, handle, room, system, user, KICKOFF_INLINE_NOTE).await
}

/// Shared driver for leader-side streaming turns (steering, kickoff). Drops
/// a context inline-note ahead of the turn so the user can tell why the
/// leader spoke (steering tick vs. kickoff vs. on-demand) and then runs
/// the standard streaming turn against the high model.
async fn run_leader_turn(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
  system_prompt: String,
  user_prompt: String,
  context_label: &str,
) -> Result<()> {
  let stream = state.ensure_room_stream(&room.code).await;
  let log =
    EventLog::new(state.clone(), room.code.clone(), handle.clone(), stream);
  log
    .record_finalized(
      RoomEventKind::InlineNote,
      Some(LEADER_AGENT.to_string()),
      context_label.to_string(),
      String::new(),
    )
    .await;

  let session = Arc::new(TurnSession::new(
    log.clone(),
    LEADER_AGENT.to_string(),
    RoomEventKind::LeaderNote,
  ));
  let inline_note_tool = GetInlineNoteDetailTool::new(
    state.clone(),
    room.code.clone(),
    log.clone(),
    LEADER_AGENT.to_string(),
  );
  let pause_tool = PauseRoomTool::new(
    state.clone(),
    room.code.clone(),
    wake_schedule_label(room),
    log.clone(),
  );

  let (_low, high) = current_provider_configs(state).await;
  let client =
    build_chat_client(&high).context("failed to construct high-tier client")?;
  let outcome = client
    .run_steering_turn(SteeringTurnInputs {
      system_prompt,
      user_prompt,
      session: session.clone(),
      inline_note_tool,
      pause_tool,
    })
    .await;

  session.finish(outcome.is_ok()).await;
  outcome.map(|_| ())
}

// -- Leader report ---------------------------------------------------------

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
      db::finish_report(&state.db, report.id, &final_content, true, completed_at)
        .await
        .report();
      stream.send(WsEvent::ReportCompleted {
        report_id,
        sequence,
        content: final_content,
        success: true,
        completed_at,
      });
      Ok(())
    }
    Err(error) => {
      db::finish_report(&state.db, report.id, "", false, completed_at)
        .await
        .report();
      stream.send(WsEvent::ReportCompleted {
        report_id,
        sequence,
        content: String::new(),
        success: false,
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

pub(crate) async fn current_provider_configs(
  state: &AppState,
) -> (ProviderConfig, ProviderConfig) {
  let settings = state.app_settings.read().await;
  (settings.low.clone(), settings.high.clone())
}

fn build_chat_system_prompt(room: &Room, persona: DebatePersona) -> String {
  format!(
    "{persona_prompt}\n\n{preamble}\n\n{guardrail}\n\n{python_style}\n\n{hint}",
    persona_prompt = persona.system_prompt,
    preamble = build_room_preamble(room),
    guardrail = CHAT_FORMAT_GUARDRAIL,
    python_style = PYTHON_STYLE_GUIDE,
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

pub(crate) fn wake_schedule_label(room: &Room) -> String {
  if room.resume_schedule_label.trim().is_empty() {
    DEFAULT_WAKE_LABEL.to_string()
  } else {
    room.resume_schedule_label.clone()
  }
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

fn render_transcript_messages(
  events: &[RoomEvent],
) -> Vec<rig::completion::Message> {
  events
    .iter()
    .filter(|event| !matches!(event.kind, RoomEventKind::Thinking))
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

fn render_transcript_text(events: &[RoomEvent]) -> String {
  events
    .iter()
    .filter(|event| !matches!(event.kind, RoomEventKind::Thinking))
    .map(format_transcript_line)
    .collect::<Vec<_>>()
    .join("\n\n")
}

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
    RoomEventKind::Thinking => String::new(),
    RoomEventKind::AgentChat
    | RoomEventKind::LeaderNote
    | RoomEventKind::UserChat => {
      format!("[{timestamp}] {speaker}: {}", event.content)
    }
  }
}

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
