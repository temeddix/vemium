//! Per-room orchestration.
//!
//! Starting a room spawns three Tokio tasks:
//!
//! 1. **Debate loop** ([`run_debate_loop`]): the heartbeat. Picks the next
//!    persona, runs one streaming turn through the low-tier model with tool
//!    support, sleeps `chat_interval_seconds`, and repeats forever.
//! 2. **Evaluation tick** ([`run_evaluation_loop`]): every
//!    `evaluation_interval_seconds`, the high model emits a `leader_note`
//!    that compliments / criticizes / redirects the debate.
//! 3. **Report tick** ([`run_report_loop`]): every
//!    `report_interval_seconds`, the high model writes a long-form report
//!    streamed token-by-token into a `room_reports` row.
//!
//! All three honor the room's `paused` and `stopped` flags. They observe
//! changes at task-natural boundaries (turn end, timer wake) - nothing is
//! preempted mid-LLM-call.
//!
//! ## How streaming + tools are wired
//!
//! Each turn builds a [`rig::agent::Agent`] from the room's `low` (or
//! `high`) provider config and attaches a [`DebateHook`] (or
//! [`ReportHook`]). The hook receives token deltas and tool-call lifecycle
//! callbacks from Rig and forwards them to the room's WebSocket broadcaster
//! plus persistent storage. We do not iterate raw stream items ourselves -
//! Rig drives the multi-turn agentic loop internally and we just await its
//! [`MultiTurnStreamItem::FinalResponse`] to know when to stop.

use crate::app_state::{AppState, RoomHandle};
use crate::db;
use crate::error::ReportError;
use crate::llm::ChatClient;
use crate::models::{
  ProviderConfig, ReportStatus, Room, RoomEvent, RoomEventKind, RoomStatus,
  ToolCallRecord,
};
use crate::python_runner::PythonRunner;
use crate::streaming::{
  ReportId, TurnId, TurnKind, WsEvent, new_turn_id, report_id_for,
};
use crate::tools::leader::RequestLeaderDecisionTool;
use crate::tools::python::RunPythonTool;
use crate::tools::web_fetch::WebFetchTool;
use crate::tools::workspace::{
  CreateSubjectFolderTool, ListFilesTool, ListSubjectFoldersTool, ReadFileTool,
  WriteFileTool,
};
use crate::workspace::{DebateRoot, RoomWorkspace};
use anyhow::{Context, Result, anyhow};
use chrono::Utc;
use futures::StreamExt;
use rig::agent::{
  AgentBuilder, HookAction, MultiTurnStreamItem, PromptHook, ToolCallHookAction,
};
use rig::client::CompletionClient;
use rig::completion::{CompletionModel, Message};
use rig::message::AssistantContent;
use rig::streaming::{StreamedAssistantContent, StreamingPrompt};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, broadcast};
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
const CHAT_LENGTH_GUARDRAIL: &str =
  include_str!("prompts/non_final_word_guidance.md");

const LEADER_EVAL_AGENT: &str = "Leader (evaluation)";
const LEADER_EVAL_PROMPT: &str = include_str!("prompts/leader_evaluation.md");
const LEADER_REPORT_PROMPT: &str = include_str!("prompts/leader_report.md");

/// Tool-call iteration safety net. The LLM may keep requesting tools forever
/// in a degenerate case; this caps a single turn at a finite number of tool
/// rounds before forcing the agent to produce a final reply.
const MAX_TOOL_ROUNDS_PER_TURN: usize = 8;

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
  tokio::spawn(run_evaluation_loop(state.clone(), handle.clone(), room_id));
  tokio::spawn(run_report_loop(state, handle, room_id));

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

    if let Err(error) = result {
      tracing::warn!(%room_id, persona = %persona.name, %error, "chat turn failed");
      emit_system_message(
        &state,
        &handle,
        room_id,
        &format!("Turn for {} failed: {error}", persona.name),
      )
      .await
      .report();
    }

    let interval = snapshot.chat_interval_seconds.max(1);
    tokio::select! {
      _ = sleep(Duration::from_secs(interval)) => {}
      _ = handle.stop_notify.notified() => return,
    }
  }
}

/// Runs one debater turn end-to-end. The provider variant determines which
/// concrete Rig client is constructed; [`run_chat_turn_with_builder`] then
/// configures the agent and drives it generically over `M`.
async fn run_chat_turn(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
  persona: DebatePersona,
  workspace: RoomWorkspace,
) -> Result<()> {
  let history = db::load_room_events(&state.db, room.id).await?;
  let history_messages = render_transcript_messages(&history);
  let system_prompt = build_chat_system_prompt(room, persona);
  let user_prompt = build_chat_user_prompt(room, persona);
  let preamble = build_room_preamble(room);

  let sender = state.ensure_room_stream(room.id).await;
  let turn_id = new_turn_id();

  let _ = sender.send(WsEvent::TurnStarted {
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
  let hook = DebateHook::new(
    state.clone(),
    handle.clone(),
    room.id,
    turn_id.clone(),
    sender.clone(),
  );

  let client = ChatClient::from_config(&room.low)
    .context("failed to construct low-tier client")?;

  let result = match client {
    ChatClient::OpenRouter(c) => {
      run_chat_turn_with_builder(
        c.agent(&room.low.model),
        system_prompt,
        history_messages,
        user_prompt,
        workspace,
        runner,
        leader_tool,
        hook,
      )
      .await
    }
    ChatClient::OpenAiCompat(c) => {
      run_chat_turn_with_builder(
        c.agent(&room.low.model),
        system_prompt,
        history_messages,
        user_prompt,
        workspace,
        runner,
        leader_tool,
        hook,
      )
      .await
    }
  };

  let final_text = match result {
    Ok(text) => text,
    Err(error) => {
      let _ = sender.send(WsEvent::TurnFailed {
        turn_id,
        partial: String::new(),
        error: error.to_string(),
      });
      return Err(error);
    }
  };

  let trimmed = final_text.trim().to_string();
  if trimmed.is_empty() {
    let _ = sender.send(WsEvent::TurnFailed {
      turn_id,
      partial: String::new(),
      error: "model produced no text after tool loop".to_string(),
    });
    return Ok(());
  }

  let sequence = handle.allocate_event_sequence();
  let timestamp = Utc::now();
  let event = RoomEvent {
    room_id: room.id,
    sequence,
    kind: RoomEventKind::AgentChat,
    agent: Some(persona.name.to_string()),
    content: trimmed.clone(),
    timestamp,
  };
  db::insert_event(&state.db, &event).await.report();

  let _ = sender.send(WsEvent::TurnCompleted {
    turn_id,
    sequence,
    agent: persona.name.to_string(),
    content: trimmed,
    timestamp,
  });
  Ok(())
}

/// Generic core of the chat turn. Lives behind a function so the two
/// provider variants in [`run_chat_turn`] share the agent build and stream
/// loop without duplication. `M` carries the provider's model type through.
#[allow(clippy::too_many_arguments)]
async fn run_chat_turn_with_builder<M>(
  builder: AgentBuilder<M>,
  system_prompt: String,
  history: Vec<Message>,
  user_prompt: String,
  workspace: RoomWorkspace,
  runner: PythonRunner,
  leader_tool: RequestLeaderDecisionTool,
  hook: DebateHook,
) -> Result<String>
where
  M: CompletionModel + 'static,
{
  let agent = builder
    .preamble(&system_prompt)
    .tool(WebFetchTool::new())
    .tool(RunPythonTool::new(workspace.clone(), runner))
    .tool(ListSubjectFoldersTool::new(workspace.clone()))
    .tool(CreateSubjectFolderTool::new(workspace.clone()))
    .tool(ListFilesTool::new(workspace.clone()))
    .tool(ReadFileTool::new(workspace.clone()))
    .tool(WriteFileTool::new(workspace))
    .tool(leader_tool)
    .build();

  let reasoning_sender = hook.sender().clone();
  let reasoning_turn_id = hook.turn_id().clone();

  let mut stream = agent
    .stream_prompt(user_prompt)
    .with_history(history)
    .multi_turn(MAX_TOOL_ROUNDS_PER_TURN)
    .with_hook(hook)
    .await;

  let mut final_text = String::new();
  while let Some(item) = stream.next().await {
    match item.map_err(|e| anyhow!(e.to_string()))? {
      MultiTurnStreamItem::FinalResponse(final_response) => {
        final_text = final_response.response().to_string();
      }
      MultiTurnStreamItem::StreamAssistantItem(content) => {
        forward_reasoning(&reasoning_sender, &reasoning_turn_id, &content);
        // Text deltas, tool starts, and tool results are surfaced through
        // `DebateHook`; we only intercept reasoning here.
      }
      _ => {}
    }
  }
  Ok(final_text)
}

// -- Hook -----------------------------------------------------------------

/// Bridge between Rig's [`PromptHook`] callbacks and our WebSocket /
/// persistence layer. One instance per turn.
#[derive(Clone)]
pub struct DebateHook {
  state: AppState,
  handle: RoomHandle,
  room_id: Uuid,
  turn_id: TurnId,
  sender: broadcast::Sender<WsEvent>,
  /// Tracks `internal_call_id -> start_instant` for in-flight tool calls so
  /// we can compute durations on completion.
  tool_starts: Arc<Mutex<HashMap<String, Instant>>>,
}

impl DebateHook {
  fn new(
    state: AppState,
    handle: RoomHandle,
    room_id: Uuid,
    turn_id: TurnId,
    sender: broadcast::Sender<WsEvent>,
  ) -> Self {
    Self {
      state,
      handle,
      room_id,
      turn_id,
      sender,
      tool_starts: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  fn sender(&self) -> &broadcast::Sender<WsEvent> {
    &self.sender
  }

  fn turn_id(&self) -> &TurnId {
    &self.turn_id
  }
}

/// Helper used by the chat-turn and leader-evaluation stream loops to
/// forward reasoning tokens that arrive on the [`MultiTurnStreamItem`]
/// stream. Reasoning is not exposed via [`PromptHook`], so we extract it
/// here and send a [`WsEvent::TurnReasoningToken`] for live rendering.
fn forward_reasoning<R>(
  sender: &broadcast::Sender<WsEvent>,
  turn_id: &TurnId,
  item: &StreamedAssistantContent<R>,
) {
  let delta = match item {
    StreamedAssistantContent::Reasoning(reasoning) => {
      let text = reasoning.display_text();
      if text.is_empty() {
        return;
      }
      text
    }
    StreamedAssistantContent::ReasoningDelta { reasoning, .. } => {
      if reasoning.is_empty() {
        return;
      }
      reasoning.clone()
    }
    _ => return,
  };
  let _ = sender.send(WsEvent::TurnReasoningToken {
    turn_id: turn_id.clone(),
    delta,
  });
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
    let _ = self.sender.send(WsEvent::TurnToken {
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
    let _ = self.sender.send(WsEvent::ToolStarted {
      turn_id: self.turn_id.clone(),
      tool: tool_name.to_string(),
      args_preview: preview(args),
    });
    self
      .tool_starts
      .lock()
      .await
      .insert(internal_call_id.to_string(), Instant::now());
    ToolCallHookAction::cont()
  }

  async fn on_tool_result(
    &self,
    tool_name: &str,
    _tool_call_id: Option<String>,
    internal_call_id: &str,
    args: &str,
    result: &str,
  ) -> HookAction {
    let started = self.tool_starts.lock().await.remove(internal_call_id);
    let duration_ms =
      started.map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);
    // Heuristic: rig surfaces tool errors via `Result::Err`, which it then
    // serializes with a recognizable "Tool error:" prefix in the assistant
    // message back to the model. Treat anything else as success.
    let ok = !result.starts_with("Tool error:");
    let preview_text = preview(result);
    let args_value: serde_json::Value =
      serde_json::from_str(args).unwrap_or(serde_json::Value::Null);

    let sequence = self.handle.allocate_event_sequence();
    let timestamp = Utc::now();
    let record = ToolCallRecord {
      tool: tool_name.to_string(),
      args: args_value,
      ok,
      output_preview: preview_text.clone(),
      duration_ms,
    };
    if let Ok(serialized) = serde_json::to_string(&record) {
      let event = RoomEvent {
        room_id: self.room_id,
        sequence,
        kind: RoomEventKind::ToolCall,
        agent: None,
        content: serialized,
        timestamp,
      };
      db::insert_event(&self.state.db, &event).await.report();
    }

    let _ = self.sender.send(WsEvent::ToolCompleted {
      turn_id: self.turn_id.clone(),
      sequence,
      tool: tool_name.to_string(),
      ok,
      output_preview: preview_text,
      duration_ms,
      timestamp,
    });
    HookAction::cont()
  }
}

// -- Leader evaluation -----------------------------------------------------

async fn run_evaluation_loop(
  state: AppState,
  handle: RoomHandle,
  room_id: Uuid,
) {
  loop {
    let interval = match load_room_snapshot(&state, room_id).await {
      Some(room) => room.evaluation_interval_seconds.max(60),
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

    if let Err(error) = run_leader_evaluation(&state, &handle, &room).await {
      tracing::warn!(%room_id, %error, "leader evaluation failed");
    }
  }
}

async fn run_leader_evaluation(
  state: &AppState,
  handle: &RoomHandle,
  room: &Room,
) -> Result<()> {
  let history = db::load_room_events(&state.db, room.id).await?;
  if history.is_empty() {
    return Ok(()); // nothing to evaluate yet
  }

  let preamble = build_room_preamble(room);
  let system = format!("{LEADER_EVAL_PROMPT}\n\n{preamble}");
  let transcript = render_transcript_text(&history);
  let user = format!(
    "Here is the recent debate transcript:\n\n{transcript}\n\nIssue \
     your evaluation now."
  );

  let sender = state.ensure_room_stream(room.id).await;
  let turn_id = new_turn_id();

  let _ = sender.send(WsEvent::TurnStarted {
    turn_id: turn_id.clone(),
    agent: LEADER_EVAL_AGENT.to_string(),
    kind: TurnKind::LeaderNote,
  });

  let hook = DebateHook::new(
    state.clone(),
    handle.clone(),
    room.id,
    turn_id.clone(),
    sender.clone(),
  );

  let final_text = stream_leader_completion(&room.high, &system, user, hook)
    .await
    .inspect_err(|error| {
      let _ = sender.send(WsEvent::TurnFailed {
        turn_id: turn_id.clone(),
        partial: String::new(),
        error: error.to_string(),
      });
    })?;

  let trimmed = final_text.trim().to_string();
  if trimmed.is_empty() {
    return Ok(());
  }

  let sequence = handle.allocate_event_sequence();
  let timestamp = Utc::now();
  let event = RoomEvent {
    room_id: room.id,
    sequence,
    kind: RoomEventKind::LeaderNote,
    agent: Some(LEADER_EVAL_AGENT.to_string()),
    content: trimmed.clone(),
    timestamp,
  };
  db::insert_event(&state.db, &event).await.report();

  let _ = sender.send(WsEvent::TurnCompleted {
    turn_id,
    sequence,
    agent: LEADER_EVAL_AGENT.to_string(),
    content: trimmed,
    timestamp,
  });
  Ok(())
}

/// Streams a leader completion (no tools) and forwards token deltas through
/// the supplied [`DebateHook`].
async fn stream_leader_completion(
  high: &ProviderConfig,
  system_prompt: &str,
  user_prompt: String,
  hook: DebateHook,
) -> Result<String> {
  let client = ChatClient::from_config(high)
    .context("failed to construct high-tier client")?;
  let model = high.model.clone();
  match client {
    ChatClient::OpenRouter(c) => {
      run_no_tool_stream(
        c.agent(&model),
        system_prompt.to_string(),
        user_prompt,
        hook,
      )
      .await
    }
    ChatClient::OpenAiCompat(c) => {
      run_no_tool_stream(
        c.agent(&model),
        system_prompt.to_string(),
        user_prompt,
        hook,
      )
      .await
    }
  }
}

async fn run_no_tool_stream<M>(
  builder: AgentBuilder<M>,
  system_prompt: String,
  user_prompt: String,
  hook: DebateHook,
) -> Result<String>
where
  M: CompletionModel + 'static,
{
  let agent = builder.preamble(&system_prompt).build();
  let reasoning_sender = hook.sender().clone();
  let reasoning_turn_id = hook.turn_id().clone();
  let mut stream = agent.stream_prompt(user_prompt).with_hook(hook).await;

  let mut final_text = String::new();
  while let Some(item) = stream.next().await {
    match item.map_err(|e| anyhow!(e.to_string()))? {
      MultiTurnStreamItem::FinalResponse(final_response) => {
        final_text = final_response.response().to_string();
      }
      MultiTurnStreamItem::StreamAssistantItem(content) => {
        forward_reasoning(&reasoning_sender, &reasoning_turn_id, &content);
      }
      _ => {}
    }
  }
  Ok(final_text)
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

  let sender = state.ensure_room_stream(room.id).await;
  let _ = sender.send(WsEvent::ReportStarted {
    report_id: report_id.clone(),
    sequence,
  });

  let hook = ReportHook::new(report_id.clone(), sender.clone());

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
      let _ = sender.send(WsEvent::ReportCompleted {
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
      let _ = sender.send(WsEvent::ReportCompleted {
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
  let client = ChatClient::from_config(high)
    .context("failed to construct high-tier client for report")?;
  let model = high.model.clone();
  match client {
    ChatClient::OpenRouter(c) => {
      run_report_stream(
        c.agent(&model),
        system_prompt.to_string(),
        user_prompt,
        hook,
      )
      .await
    }
    ChatClient::OpenAiCompat(c) => {
      run_report_stream(
        c.agent(&model),
        system_prompt.to_string(),
        user_prompt,
        hook,
      )
      .await
    }
  }
}

async fn run_report_stream<M>(
  builder: AgentBuilder<M>,
  system_prompt: String,
  user_prompt: String,
  hook: ReportHook,
) -> Result<String>
where
  M: CompletionModel + 'static,
{
  let agent = builder.preamble(&system_prompt).build();
  let mut stream = agent.stream_prompt(user_prompt).with_hook(hook).await;
  let mut final_text = String::new();
  while let Some(item) = stream.next().await {
    if let MultiTurnStreamItem::FinalResponse(final_response) =
      item.map_err(|e| anyhow!(e.to_string()))?
    {
      final_text = final_response.response().to_string();
    }
  }
  Ok(final_text)
}

/// Hook for leader-report streaming. Token deltas become `ReportToken`
/// events; tool-call methods are unused (no tools are attached) so they
/// stay at the trait's default no-op implementation.
#[derive(Clone)]
struct ReportHook {
  report_id: ReportId,
  sender: broadcast::Sender<WsEvent>,
}

impl ReportHook {
  fn new(report_id: ReportId, sender: broadcast::Sender<WsEvent>) -> Self {
    Self { report_id, sender }
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
    let _ = self.sender.send(WsEvent::ReportToken {
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
    guardrail = CHAT_LENGTH_GUARDRAIL,
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

/// Renders persisted events as the agent's chat history. Tool calls and
/// system events are excluded - they are private orchestrator state, not
/// part of the shared dialogue.
///
/// The history alternates by speaker label (the prior speaker's name is
/// embedded in each `assistant` message so the new debater can tell turns
/// apart).
fn render_transcript_messages(events: &[RoomEvent]) -> Vec<Message> {
  events
    .iter()
    .filter(|event| {
      matches!(
        event.kind,
        RoomEventKind::AgentChat | RoomEventKind::LeaderNote
      )
    })
    .map(|event| {
      let speaker = event.agent.as_deref().unwrap_or("speaker");
      let body = format!("{speaker}: {}", event.content);
      let assistant_content = AssistantContent::text(body);
      Message::Assistant {
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
    .filter(|event| {
      matches!(
        event.kind,
        RoomEventKind::AgentChat | RoomEventKind::LeaderNote
      )
    })
    .map(|event| {
      let speaker = event.agent.as_deref().unwrap_or("speaker");
      format!("[{speaker}] {}", event.content)
    })
    .collect::<Vec<_>>()
    .join("\n\n")
}

fn preview(text: &str) -> String {
  if text.chars().count() <= PREVIEW_MAX_CHARS {
    return text.to_string();
  }
  let mut out: String = text.chars().take(PREVIEW_MAX_CHARS).collect();
  out.push_str("...");
  out
}

async fn emit_system_message(
  state: &AppState,
  handle: &RoomHandle,
  room_id: Uuid,
  message: &str,
) -> Result<()> {
  let sequence = handle.allocate_event_sequence();
  let timestamp = Utc::now();
  let event = RoomEvent {
    room_id,
    sequence,
    kind: RoomEventKind::System,
    agent: None,
    content: message.to_string(),
    timestamp,
  };
  db::insert_event(&state.db, &event).await?;
  let sender = state.ensure_room_stream(room_id).await;
  let _ = sender.send(WsEvent::RoomStatus {
    status: state
      .rooms
      .read()
      .await
      .get(&room_id)
      .map(|room| room.status)
      .unwrap_or(RoomStatus::Active),
  });
  let turn_id = new_turn_id();
  let _ = sender.send(WsEvent::TurnStarted {
    turn_id: turn_id.clone(),
    agent: "system".to_string(),
    kind: TurnKind::AgentChat,
  });
  let _ = sender.send(WsEvent::TurnCompleted {
    turn_id,
    sequence,
    agent: "system".to_string(),
    content: message.to_string(),
    timestamp,
  });
  Ok(())
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
