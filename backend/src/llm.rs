//! Provider client construction and turn orchestration.
//!
//! Two API families are supported, selected via [`ProviderConfig::api_type`]:
//!
//! - [`ApiType::Ollama`] uses rig's native Ollama client (NDJSON over
//!   `/api/chat`). Reasoning arrives on the `thinking` field.
//! - [`ApiType::OpenRouter`] uses rig's OpenRouter client (SSE over
//!   `/v1/chat/completions`). Reasoning arrives on `delta.reasoning`. This
//!   client also works against any OpenAI-compatible endpoint that emits
//!   `delta.reasoning` (notably llama.cpp); only the API key is required by
//!   OpenRouter itself.
//!
//! Both clients are exposed through [`ChatClient`], a `dyn`-safe trait that
//! hides the concrete rig types. The runtime drives turns by calling these
//! trait methods, so it never sees provider-specific stream payloads.

use std::sync::Arc;

use anyhow::{Context, Result, anyhow};
use async_trait::async_trait;
use futures::StreamExt;
use rig::agent::{AgentBuilder, MultiTurnStreamItem};
use rig::client::BearerAuth;
use rig::client::CompletionClient;
use rig::completion::{CompletionModel, Message, Prompt};
use rig::providers::{
  ollama::{self, OllamaApiKey},
  openrouter,
};
use rig::streaming::{StreamedAssistantContent, StreamingPrompt};
use serde_json::{Value, json};

use crate::app_state::AppState;
use crate::models::{ApiType, ProviderConfig};
use crate::python_runner::PythonRunner;
use crate::runtime::{DebateHook, ReportHook, TurnRecorder};
use crate::streaming::{RoomStream, TurnId, WsEvent};
use crate::tools::do_nothing::DoNothingTool;
use crate::tools::halt_room::HaltRoomTool;
use crate::tools::leader::RequestLeaderDecisionTool;
use crate::tools::proceed_room::ProceedRoomTool;
use crate::tools::python::RunPythonTool;
use crate::tools::web_fetch::WebFetchTool;
use crate::tools::workspace::{
  CreateSubjectFolderTool, ListFilesTool, ListSubjectFoldersTool, ReadFileTool,
  WriteFileTool,
};
use crate::workspace::RoomWorkspace;

/// Tool-call iteration safety net. The LLM may keep requesting tools forever
/// in a degenerate case; this caps a single turn at a finite number of tool
/// rounds before forcing the agent to produce a final reply.
const MAX_TOOL_ROUNDS_PER_TURN: usize = 32;

/// Native Ollama enables thinking output via a top-level `think: true` flag
/// on the chat request. Without it, models that *can* think (qwen3, gpt-oss,
/// deepseek-r1, etc.) silently omit the `thinking` field, and the streaming
/// loop has no reasoning to forward. Models that don't support thinking
/// simply ignore the flag.
fn ollama_extra_params() -> Value {
  json!({ "think": true })
}

/// OpenRouter requires opting in to reasoning streaming on the request body
/// (see <https://openrouter.ai/docs/use-cases/reasoning-tokens>). Setting
/// `enabled: true` works across reasoning-capable models from every vendor;
/// non-reasoning models accept the flag and just don't emit deltas.
fn openrouter_extra_params() -> Value {
  json!({ "reasoning": { "enabled": true } })
}

/// Inputs for a debater turn (full tool set). Bundled into a single struct
/// because the runtime always passes them together.
pub struct DebateTurnInputs {
  pub system_prompt: String,
  pub history: Vec<Message>,
  pub user_prompt: String,
  pub workspace: RoomWorkspace,
  pub runner: PythonRunner,
  pub leader_tool: RequestLeaderDecisionTool,
  pub do_nothing_tool: DoNothingTool,
  pub hook: DebateHook,
  /// App state passed through so per-turn tools that emit `InlineNote` can
  /// reach the room's WebSocket stream.
  pub state: AppState,
  pub room_code: String,
  /// Author label embedded into inline notes (the persona's name).
  pub author: String,
}

/// Inputs for the halt-gate tool loop. The model must call exactly one of
/// the two tools — either `halt_room` (pause + leader bubble) or
/// `do_nothing` (no-op + inline note). The gate never streams tokens to
/// the UI; tool calls carry the entire decision.
pub struct HaltGateInputs {
  pub system_prompt: String,
  pub user_prompt: String,
  pub halt_tool: HaltRoomTool,
  pub do_nothing_tool: DoNothingTool,
}

/// Inputs for the proceed-gate tool loop. Mirror of [`HaltGateInputs`] for
/// the wake-on-cron decision; choices are `proceed_room` or `do_nothing`.
pub struct ProceedGateInputs {
  pub system_prompt: String,
  pub user_prompt: String,
  pub proceed_tool: ProceedRoomTool,
  pub do_nothing_tool: DoNothingTool,
}

/// Inputs for a no-tool streaming turn (leader evaluation / report). The
/// `hook` is generic over its concrete type so the same struct can be
/// reused for both [`DebateHook`] and [`ReportHook`].
pub struct NoToolTurnInputs<H> {
  pub system_prompt: String,
  pub user_prompt: String,
  pub hook: H,
}

/// Provider-agnostic interface for one LLM turn. Implementations adapt the
/// concrete rig client (Ollama / OpenRouter) and let the runtime pass turn
/// inputs without knowing the underlying provider's response shape.
#[async_trait]
pub trait ChatClient: Send + Sync {
  /// Streaming debate turn with the full tool set. The hook receives token
  /// deltas, reasoning deltas, and tool-call lifecycle events as the model
  /// streams; the returned String is the final assistant message.
  async fn run_debate_turn(&self, inputs: DebateTurnInputs) -> Result<String>;

  /// Streaming no-tool turn used for the periodic leader steering nudge.
  /// The hook receives token / reasoning deltas; the result is the final
  /// text.
  async fn run_steering_turn(
    &self,
    inputs: NoToolTurnInputs<DebateHook>,
  ) -> Result<String>;

  /// Non-streaming gate turn for the convergence halt decision. The model
  /// is expected to call exactly one of `halt_room` / `do_nothing`; both
  /// tools own their side effects, so the assistant's text reply is
  /// discarded.
  async fn run_halt_gate_turn(&self, inputs: HaltGateInputs) -> Result<()>;

  /// Non-streaming gate turn for the scheduled wake decision. Mirrors
  /// [`Self::run_halt_gate_turn`] but with `proceed_room` instead of
  /// `halt_room`.
  async fn run_proceed_gate_turn(
    &self,
    inputs: ProceedGateInputs,
  ) -> Result<()>;

  /// Streaming no-tool turn used for the periodic leader report. Like
  /// [`Self::run_evaluation_turn`], but the hook is a [`ReportHook`] that
  /// emits `ReportToken` events instead of turn tokens.
  async fn run_report_turn(
    &self,
    inputs: NoToolTurnInputs<ReportHook>,
  ) -> Result<String>;

  /// Non-streaming one-shot prompt. Used by the on-demand leader-decision
  /// tool, which needs a single answer without tool support or streaming.
  async fn prompt_once(&self, preamble: String, user: String)
  -> Result<String>;
}

/// Builds an [`ChatClient`] from a [`ProviderConfig`]. Picks the concrete
/// client (Ollama vs OpenRouter) based on [`ProviderConfig::api_type`].
pub fn build_chat_client(
  config: &ProviderConfig,
) -> Result<Arc<dyn ChatClient>> {
  match config.api_type {
    ApiType::Ollama => {
      let client = OllamaChatClient::new(config)?;
      Ok(Arc::new(client))
    }
    ApiType::OpenRouter => {
      let client = OpenRouterChatClient::new(config)?;
      Ok(Arc::new(client))
    }
  }
}

// -- Ollama ---------------------------------------------------------------

/// Wraps rig's native Ollama client. The base URL points at the Ollama
/// server root (no `/v1` suffix); rig appends the native endpoints itself.
struct OllamaChatClient {
  client: ollama::Client,
  model: String,
}

impl OllamaChatClient {
  fn new(config: &ProviderConfig) -> Result<Self> {
    let base = config.base_url.trim();
    if base.is_empty() {
      return Err(anyhow!("Ollama provider requires base_url"));
    }
    // Native Ollama API lives at the server root; users may have copied a
    // `/v1` URL from the OpenAI-compat config, so strip it for them.
    let base = base.trim_end_matches('/');
    let base = base.strip_suffix("/v1").unwrap_or(base);

    let api_key = config
      .api_key
      .as_deref()
      .filter(|k| !k.is_empty())
      .map(OllamaApiKey::from)
      .unwrap_or_default();
    let client = ollama::Client::builder()
      .base_url(base)
      .api_key(api_key)
      .build()
      .map_err(|e| anyhow!(e.to_string()))
      .context("failed to build Ollama chat client")?;
    Ok(Self {
      client,
      model: config.model.clone(),
    })
  }
}

#[async_trait]
impl ChatClient for OllamaChatClient {
  async fn run_debate_turn(&self, inputs: DebateTurnInputs) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(ollama_extra_params());
    run_chat_turn_with_builder(builder, inputs).await
  }

  async fn run_steering_turn(
    &self,
    inputs: NoToolTurnInputs<DebateHook>,
  ) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(ollama_extra_params());
    run_no_tool_stream(builder, inputs).await
  }

  async fn run_halt_gate_turn(&self, inputs: HaltGateInputs) -> Result<()> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(ollama_extra_params());
    run_halt_gate_with_builder(builder, inputs).await
  }

  async fn run_proceed_gate_turn(
    &self,
    inputs: ProceedGateInputs,
  ) -> Result<()> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(ollama_extra_params());
    run_proceed_gate_with_builder(builder, inputs).await
  }

  async fn run_report_turn(
    &self,
    inputs: NoToolTurnInputs<ReportHook>,
  ) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(ollama_extra_params());
    run_report_stream(builder, inputs).await
  }

  async fn prompt_once(
    &self,
    preamble: String,
    user: String,
  ) -> Result<String> {
    self
      .client
      .agent(&self.model)
      .preamble(&preamble)
      .build()
      .prompt(user)
      .await
      .map_err(|e| anyhow!(e.to_string()))
  }
}

// -- OpenRouter -----------------------------------------------------------

/// Wraps rig's OpenRouter client. The OpenRouter API key is required;
/// `base_url` is normally `https://openrouter.ai/api/v1` and can be left
/// blank to use rig's default.
struct OpenRouterChatClient {
  client: openrouter::Client,
  model: String,
}

impl OpenRouterChatClient {
  fn new(config: &ProviderConfig) -> Result<Self> {
    let key = config
      .api_key
      .as_deref()
      .map(str::trim)
      .filter(|k| !k.is_empty())
      .ok_or_else(|| anyhow!("OpenRouter provider requires api_key"))?;
    let api_key = BearerAuth::from(key.to_owned());
    let mut builder = openrouter::Client::builder().api_key(api_key);
    let base = config.base_url.trim();
    if !base.is_empty() {
      builder = builder.base_url(base);
    }
    let client = builder
      .build()
      .map_err(|e| anyhow!(e.to_string()))
      .context("failed to build OpenRouter chat client")?;
    Ok(Self {
      client,
      model: config.model.clone(),
    })
  }
}

#[async_trait]
impl ChatClient for OpenRouterChatClient {
  async fn run_debate_turn(&self, inputs: DebateTurnInputs) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(openrouter_extra_params());
    run_chat_turn_with_builder(builder, inputs).await
  }

  async fn run_steering_turn(
    &self,
    inputs: NoToolTurnInputs<DebateHook>,
  ) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(openrouter_extra_params());
    run_no_tool_stream(builder, inputs).await
  }

  async fn run_halt_gate_turn(&self, inputs: HaltGateInputs) -> Result<()> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(openrouter_extra_params());
    run_halt_gate_with_builder(builder, inputs).await
  }

  async fn run_proceed_gate_turn(
    &self,
    inputs: ProceedGateInputs,
  ) -> Result<()> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(openrouter_extra_params());
    run_proceed_gate_with_builder(builder, inputs).await
  }

  async fn run_report_turn(
    &self,
    inputs: NoToolTurnInputs<ReportHook>,
  ) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(openrouter_extra_params());
    run_report_stream(builder, inputs).await
  }

  async fn prompt_once(
    &self,
    preamble: String,
    user: String,
  ) -> Result<String> {
    self
      .client
      .agent(&self.model)
      .preamble(&preamble)
      .build()
      .prompt(user)
      .await
      .map_err(|e| anyhow!(e.to_string()))
  }
}

// -- Generic helpers ------------------------------------------------------

/// Generic core of a debater turn. Builds the agent with the full tool set,
/// drives the multi-turn streaming loop, forwards reasoning deltas through
/// the hook's broadcaster, and returns the final assistant text.
async fn run_chat_turn_with_builder<M>(
  builder: AgentBuilder<M>,
  inputs: DebateTurnInputs,
) -> Result<String>
where
  M: CompletionModel + 'static,
{
  let agent = builder
    .preamble(&inputs.system_prompt)
    .tool(WebFetchTool::new())
    .tool(RunPythonTool::new(
      inputs.workspace.clone(),
      inputs.runner,
      inputs.state,
      inputs.room_code,
      inputs.author,
    ))
    .tool(ListSubjectFoldersTool::new(inputs.workspace.clone()))
    .tool(CreateSubjectFolderTool::new(inputs.workspace.clone()))
    .tool(ListFilesTool::new(inputs.workspace.clone()))
    .tool(ReadFileTool::new(inputs.workspace.clone()))
    .tool(WriteFileTool::new(inputs.workspace))
    .tool(inputs.leader_tool)
    .tool(inputs.do_nothing_tool)
    .build();

  let reasoning_stream = inputs.hook.stream().clone();
  let reasoning_turn_id = inputs.hook.turn_id().clone();
  let reasoning_recorder = inputs.hook.recorder();

  let mut stream = agent
    .stream_prompt(inputs.user_prompt)
    .with_history(inputs.history)
    .multi_turn(MAX_TOOL_ROUNDS_PER_TURN)
    .with_hook(inputs.hook)
    .await;

  let mut final_text = String::new();
  while let Some(item) = stream.next().await {
    match item.map_err(|e| anyhow!(e.to_string()))? {
      MultiTurnStreamItem::FinalResponse(final_response) => {
        final_text = final_response.response().to_string();
      }
      MultiTurnStreamItem::StreamAssistantItem(content) => {
        forward_reasoning(
          &reasoning_stream,
          &reasoning_turn_id,
          &reasoning_recorder,
          &content,
        )
        .await;
        // Text deltas, tool starts, and tool results are surfaced through
        // `DebateHook`; we only intercept reasoning here.
      }
      _ => {}
    }
  }
  Ok(final_text)
}

/// Streaming no-tool turn used by leader evaluations. Same shape as
/// [`run_chat_turn_with_builder`] but without the tool wiring.
async fn run_no_tool_stream<M>(
  builder: AgentBuilder<M>,
  inputs: NoToolTurnInputs<DebateHook>,
) -> Result<String>
where
  M: CompletionModel + 'static,
{
  let agent = builder.preamble(&inputs.system_prompt).build();
  let reasoning_stream = inputs.hook.stream().clone();
  let reasoning_turn_id = inputs.hook.turn_id().clone();
  let reasoning_recorder = inputs.hook.recorder();
  let mut stream = agent
    .stream_prompt(inputs.user_prompt)
    .with_hook(inputs.hook)
    .await;

  let mut final_text = String::new();
  while let Some(item) = stream.next().await {
    match item.map_err(|e| anyhow!(e.to_string()))? {
      MultiTurnStreamItem::FinalResponse(final_response) => {
        final_text = final_response.response().to_string();
      }
      MultiTurnStreamItem::StreamAssistantItem(content) => {
        forward_reasoning(
          &reasoning_stream,
          &reasoning_turn_id,
          &reasoning_recorder,
          &content,
        )
        .await;
      }
      _ => {}
    }
  }
  Ok(final_text)
}

/// Runs the halt-gate tool loop: build the agent with `halt_room` +
/// `do_nothing` and let the model pick exactly one. The tools own their
/// side effects (bubble + status flip for halt; inline note for nothing),
/// so we discard the assistant's text reply.
async fn run_halt_gate_with_builder<M>(
  builder: AgentBuilder<M>,
  inputs: HaltGateInputs,
) -> Result<()>
where
  M: CompletionModel + 'static,
{
  let agent = builder
    .preamble(&inputs.system_prompt)
    .tool(inputs.halt_tool)
    .tool(inputs.do_nothing_tool)
    .build();
  agent
    .prompt(inputs.user_prompt)
    .max_turns(MAX_TOOL_ROUNDS_PER_TURN)
    .await
    .map_err(|e| anyhow!(e.to_string()))?;
  Ok(())
}

/// Mirror of [`run_halt_gate_with_builder`] for the wake-on-cron decision.
async fn run_proceed_gate_with_builder<M>(
  builder: AgentBuilder<M>,
  inputs: ProceedGateInputs,
) -> Result<()>
where
  M: CompletionModel + 'static,
{
  let agent = builder
    .preamble(&inputs.system_prompt)
    .tool(inputs.proceed_tool)
    .tool(inputs.do_nothing_tool)
    .build();
  agent
    .prompt(inputs.user_prompt)
    .max_turns(MAX_TOOL_ROUNDS_PER_TURN)
    .await
    .map_err(|e| anyhow!(e.to_string()))?;
  Ok(())
}

/// Streaming no-tool turn used by leader reports. The hook is a
/// [`ReportHook`] which emits `ReportToken` events instead of turn tokens.
async fn run_report_stream<M>(
  builder: AgentBuilder<M>,
  inputs: NoToolTurnInputs<ReportHook>,
) -> Result<String>
where
  M: CompletionModel + 'static,
{
  let agent = builder.preamble(&inputs.system_prompt).build();
  let mut stream = agent
    .stream_prompt(inputs.user_prompt)
    .with_hook(inputs.hook)
    .await;
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

/// Forwards reasoning tokens that arrive on the [`MultiTurnStreamItem`]
/// stream. Reasoning is not exposed via [`rig::agent::PromptHook`], so we
/// extract it here, push it into the [`TurnRecorder`] (so the eventual
/// `MessageAdded` includes the full trace inline) and emit a
/// [`WsEvent::DraftReasoning`] frame for live rendering.
async fn forward_reasoning<R>(
  stream: &RoomStream,
  turn_id: &TurnId,
  recorder: &TurnRecorder,
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
  recorder.append_reasoning(&delta).await;
  stream.send(WsEvent::DraftReasoning {
    turn_id: turn_id.clone(),
    delta,
  });
}
