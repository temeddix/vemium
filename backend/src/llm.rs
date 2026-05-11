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

use anyhow::{Context, Result, anyhow, bail};
use async_trait::async_trait;
use futures::StreamExt;
use rig::agent::{AgentBuilder, MultiTurnStreamItem};
use rig::client::BearerAuth;
use rig::client::CompletionClient;
use rig::completion::{CompletionModel, Message};
use rig::providers::{
  ollama::{self, OllamaApiKey},
  openrouter,
};
use rig::streaming::{StreamedAssistantContent, StreamingPrompt};
use rig::tool::server::ToolServer;
use serde_json::{Value, json};

use crate::error::ReportError;
use crate::mcp_client::McpHandle;
use crate::models::{ApiType, ProviderConfig};
use crate::python_runner::PythonRunner;

/// Fallback context length used when the provider API does not return one.
const CONTEXT_SIZE_FALLBACK: u64 = 32_768;

const COMPACTION_PROMPT: &str = "You are the room leader. Summarize the \
  following debate transcript concisely. Capture key arguments, decisions, \
  findings, tool outputs, and the current state of the discussion. The \
  summary replaces the original transcript as context for future turns — \
  make it self-contained. Write in past tense. When referencing important \
  messages or inline notes, preserve their `#N` identifiers (e.g. `#42`) \
  so they can be retrieved later with the `get_room_event` tool.";
use crate::runtime::{DebateHook, ReportHook, TurnSession};
use crate::tools::do_nothing::DoNothingTool;
use crate::tools::document_to_md::DocumentToMdTool;
use crate::tools::download_file::DownloadFileTool;
use crate::tools::get_room_event::GetRoomEventTool;
use crate::tools::leader::RequestLeaderDecisionTool;
use crate::tools::pause_room::PauseRoomTool;
use crate::tools::python::RunPythonTool;
use crate::tools::resume_room::ResumeRoomTool;
use crate::tools::shell::RunShellTool;
use crate::tools::web_fetch::WebFetchTool;
use crate::tools::workspace::{
  EditFileTool, ListFilesTool, ReadFileTool, WriteFileTool,
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

/// Inputs for a debater turn (full tool set). The `session` segments the
/// stream into thinking and bubble rows; tools persist their own
/// inline-note rows out of band.
pub struct DebateTurnInputs {
  pub system_prompt: String,
  pub history: Vec<Message>,
  pub user_prompt: String,
  pub workspace: RoomWorkspace,
  pub runner: PythonRunner,
  pub leader_tool: RequestLeaderDecisionTool,
  pub do_nothing_tool: DoNothingTool,
  pub room_event_tool: GetRoomEventTool,
  pub session: Arc<TurnSession>,
  /// Singleton MCP setup for the Playwright sidecar. Always present.
  /// When the sidecar was unreachable at startup, `mcp.peer()` returns
  /// `None`: `build_chat_client` skips MCP tool registration entirely,
  /// and `web_fetch`'s direct call returns a structured error.
  pub mcp: McpHandle,
}

/// Inputs for the resume-gate tool loop. Used while a room is paused: the
/// model may call `resume_room` (wake the debate) or `do_nothing` (stay
/// paused), with `get_inline_note_detail` available for context lookups.
pub struct ResumeGateInputs {
  pub system_prompt: String,
  pub user_prompt: String,
  pub resume_tool: ResumeRoomTool,
  pub do_nothing_tool: DoNothingTool,
  pub room_event_tool: GetRoomEventTool,
  pub session: Arc<TurnSession>,
}

/// Inputs for the leader steering turn. The session segments thinking /
/// bubble rows; tools own their inline-note rows. `pause_room` is
/// available so the leader can pause the debate directly.
pub struct SteeringTurnInputs {
  pub system_prompt: String,
  pub user_prompt: String,
  pub session: Arc<TurnSession>,
  pub room_event_tool: GetRoomEventTool,
  pub pause_tool: PauseRoomTool,
}

/// Inputs for the on-demand leader-decision turn invoked by the
/// `request_leader_decision` tool from a debater. Carries `pause_room`
/// so the leader can pause the room itself, plus `get_inline_note_detail`
/// for breadcrumb lookups. The session segments the stream like any
/// other turn; the final text is also returned to the calling debater.
pub struct LeaderDecisionTurnInputs {
  pub system_prompt: String,
  pub user_prompt: String,
  pub pause_tool: PauseRoomTool,
  pub room_event_tool: GetRoomEventTool,
  pub session: Arc<TurnSession>,
}

/// Inputs for a no-tool streaming turn (leader report). Used only by the
/// report flow now; gate / steering turns carry their own input types.
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
  /// streams. Returns `(final_text, input_tokens)` where `input_tokens` is
  /// the actual token count reported by the provider for this turn — used
  /// by the caller to decide whether to trigger history compaction.
  async fn run_debate_turn(
    &self,
    inputs: DebateTurnInputs,
  ) -> Result<(String, u64)>;

  /// Streaming turn used for the periodic leader steering nudge. The hook
  /// receives token / reasoning deltas; the result is the final text. The
  /// steering turn carries `get_inline_note_detail` so the leader can
  /// peek at breadcrumb bodies plus `pause_room` so it can pause the
  /// debate directly when the discussion has run its course.
  async fn run_steering_turn(
    &self,
    inputs: SteeringTurnInputs,
  ) -> Result<String>;

  /// Non-streaming tool-loop turn for the on-demand leader decision
  /// triggered by `request_leader_decision`. The leader may call
  /// `pause_room` to pause the debate (which emits its own bubble) or
  /// just produce a verdict as text; the final text is returned to the
  /// caller for downstream rendering.
  async fn run_leader_decision_turn(
    &self,
    inputs: LeaderDecisionTurnInputs,
  ) -> Result<String>;

  /// Non-streaming gate turn for the scheduled wake decision while a
  /// room is paused. The model is expected to call exactly one of
  /// `resume_room` / `do_nothing`; both tools own their side effects, so
  /// the assistant's text reply is discarded.
  async fn run_resume_gate_turn(&self, inputs: ResumeGateInputs) -> Result<()>;

  /// Streaming no-tool turn used for the periodic leader report. Like
  /// [`Self::run_evaluation_turn`], but the hook is a [`ReportHook`] that
  /// emits `ReportToken` events instead of turn tokens.
  async fn run_report_turn(
    &self,
    inputs: NoToolTurnInputs<ReportHook>,
  ) -> Result<String>;
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
      bail!("Ollama provider requires base_url");
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
  async fn run_debate_turn(
    &self,
    inputs: DebateTurnInputs,
  ) -> Result<(String, u64)> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(ollama_extra_params());
    run_chat_turn_with_builder(builder, inputs).await
  }

  async fn run_steering_turn(
    &self,
    inputs: SteeringTurnInputs,
  ) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(ollama_extra_params());
    run_steering_stream(builder, inputs).await
  }

  async fn run_leader_decision_turn(
    &self,
    inputs: LeaderDecisionTurnInputs,
  ) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(ollama_extra_params());
    run_leader_decision_with_builder(builder, inputs).await
  }

  async fn run_resume_gate_turn(&self, inputs: ResumeGateInputs) -> Result<()> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(ollama_extra_params());
    run_resume_gate_with_builder(builder, inputs).await
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
  async fn run_debate_turn(
    &self,
    inputs: DebateTurnInputs,
  ) -> Result<(String, u64)> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(openrouter_extra_params());
    run_chat_turn_with_builder(builder, inputs).await
  }

  async fn run_steering_turn(
    &self,
    inputs: SteeringTurnInputs,
  ) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(openrouter_extra_params());
    run_steering_stream(builder, inputs).await
  }

  async fn run_leader_decision_turn(
    &self,
    inputs: LeaderDecisionTurnInputs,
  ) -> Result<String> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(openrouter_extra_params());
    run_leader_decision_with_builder(builder, inputs).await
  }

  async fn run_resume_gate_turn(&self, inputs: ResumeGateInputs) -> Result<()> {
    let builder = self
      .client
      .agent(&self.model)
      .additional_params(openrouter_extra_params());
    run_resume_gate_with_builder(builder, inputs).await
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
}

// -- Generic helpers ------------------------------------------------------

/// Generic core of a debater turn. Builds the agent with the full tool
/// set, drives the multi-turn streaming loop, and returns the final
/// assistant text. Reasoning and text deltas are routed into the
/// session's row state machine; tool inline-note rows are produced by
/// each tool from inside its own `call()`.
async fn run_chat_turn_with_builder<M>(
  builder: AgentBuilder<M>,
  inputs: DebateTurnInputs,
) -> Result<(String, u64)>
where
  M: CompletionModel + 'static,
{
  let session = inputs.session.clone();
  let log = session.log().clone();
  let author = session.author().to_string();
  let workspace = inputs.workspace;
  let mcp = inputs.mcp;
  // rig-core 0.36's AgentBuilder makes `tool_server_handle()` and the
  // `.tool()` chain mutually exclusive — a builder can be in only one of
  // `WithToolServerHandle` or `WithBuilderTools` at a time. To expose
  // both our native Rig tools AND the auto-imported Playwright `browser_*`
  // tool set in the same agent, we build a single ToolServer that holds
  // both, then hand it to the agent via `tool_server_handle`.
  let mut server = ToolServer::new()
    .tool(WebFetchTool::new(
      workspace.clone(),
      mcp.clone(),
      log.clone(),
      author.clone(),
    ))
    .tool(DownloadFileTool::new(
      workspace.clone(),
      log.clone(),
      author.clone(),
    ))
    .tool(DocumentToMdTool::new(
      workspace.clone(),
      log.clone(),
      author.clone(),
    ))
    .tool(RunPythonTool::new(
      workspace.clone(),
      inputs.runner,
      log.clone(),
      author.clone(),
    ))
    .tool(ListFilesTool::new(
      workspace.clone(),
      log.clone(),
      author.clone(),
    ))
    .tool(ReadFileTool::new(
      workspace.clone(),
      log.clone(),
      author.clone(),
    ))
    .tool(WriteFileTool::new(
      workspace.clone(),
      log.clone(),
      author.clone(),
    ))
    .tool(EditFileTool::new(
      workspace.clone(),
      log.clone(),
      author.clone(),
    ))
    .tool(RunShellTool::new(workspace, log, author))
    .tool(inputs.leader_tool)
    .tool(inputs.do_nothing_tool)
    .tool(inputs.room_event_tool);
  let mut mcp_tool_names = std::collections::HashSet::new();
  if let Some(peer) = mcp.peer() {
    match peer.list_all_tools().await {
      Ok(tools) => {
        for tool in tools {
          mcp_tool_names.insert(tool.name.to_string());
          server = server.rmcp_tool(tool, peer.clone());
        }
      }
      Err(error) => {
        tracing::warn!(
          "failed to list Playwright MCP tools (continuing with native \
           tools only): {error}"
        );
      }
    }
  }
  let tool_server_handle = server.run();
  let agent = builder
    .preamble(&inputs.system_prompt)
    .tool_server_handle(tool_server_handle)
    .build();

  let mut stream = agent
    .stream_prompt(inputs.user_prompt)
    .with_history(inputs.history)
    .multi_turn(MAX_TOOL_ROUNDS_PER_TURN)
    .with_hook(DebateHook::new(session.clone(), mcp_tool_names))
    .await;

  let mut final_text = String::new();
  let mut input_tokens = 0u64;
  while let Some(item) = stream.next().await {
    match item.map_err(|e| anyhow!(e.to_string()))? {
      MultiTurnStreamItem::FinalResponse(final_response) => {
        input_tokens = final_response.usage().input_tokens;
        final_text = final_response.response().to_string();
      }
      MultiTurnStreamItem::StreamAssistantItem(content) => {
        if let Some(delta) = reasoning_delta(&content) {
          session.append_thinking(&delta).await;
        }
      }
      _ => {}
    }
  }
  Ok((final_text, input_tokens))
}

async fn run_steering_stream<M>(
  builder: AgentBuilder<M>,
  inputs: SteeringTurnInputs,
) -> Result<String>
where
  M: CompletionModel + 'static,
{
  let agent = builder
    .preamble(&inputs.system_prompt)
    .tool(inputs.room_event_tool)
    .tool(inputs.pause_tool)
    .build();
  let session = inputs.session;
  let mut stream = agent
    .stream_prompt(inputs.user_prompt)
    .multi_turn(MAX_TOOL_ROUNDS_PER_TURN)
    .with_hook(DebateHook::new(
      session.clone(),
      std::collections::HashSet::new(),
    ))
    .await;
  let mut final_text = String::new();
  while let Some(item) = stream.next().await {
    match item.map_err(|e| anyhow!(e.to_string()))? {
      MultiTurnStreamItem::FinalResponse(final_response) => {
        final_text = final_response.response().to_string();
      }
      MultiTurnStreamItem::StreamAssistantItem(content) => {
        if let Some(delta) = reasoning_delta(&content) {
          session.append_thinking(&delta).await;
        }
      }
      _ => {}
    }
  }
  Ok(final_text)
}

async fn run_leader_decision_with_builder<M>(
  builder: AgentBuilder<M>,
  inputs: LeaderDecisionTurnInputs,
) -> Result<String>
where
  M: CompletionModel + 'static,
{
  let agent = builder
    .preamble(&inputs.system_prompt)
    .tool(inputs.pause_tool)
    .tool(inputs.room_event_tool)
    .build();
  let session = inputs.session;
  let mut stream = agent
    .stream_prompt(inputs.user_prompt)
    .multi_turn(MAX_TOOL_ROUNDS_PER_TURN)
    .with_hook(DebateHook::new(
      session.clone(),
      std::collections::HashSet::new(),
    ))
    .await;
  let mut final_text = String::new();
  while let Some(item) = stream.next().await {
    match item.map_err(|e| anyhow!(e.to_string()))? {
      MultiTurnStreamItem::FinalResponse(final_response) => {
        final_text = final_response.response().to_string();
      }
      MultiTurnStreamItem::StreamAssistantItem(content) => {
        if let Some(delta) = reasoning_delta(&content) {
          session.append_thinking(&delta).await;
        }
      }
      _ => {}
    }
  }
  Ok(final_text)
}

async fn run_resume_gate_with_builder<M>(
  builder: AgentBuilder<M>,
  inputs: ResumeGateInputs,
) -> Result<()>
where
  M: CompletionModel + 'static,
{
  let agent = builder
    .preamble(&inputs.system_prompt)
    .tool(inputs.resume_tool)
    .tool(inputs.do_nothing_tool)
    .tool(inputs.room_event_tool)
    .build();
  let session = inputs.session;
  let mut stream = agent
    .stream_prompt(inputs.user_prompt)
    .multi_turn(MAX_TOOL_ROUNDS_PER_TURN)
    .with_hook(DebateHook::new(
      session.clone(),
      std::collections::HashSet::new(),
    ))
    .await;
  while let Some(item) = stream.next().await {
    if let MultiTurnStreamItem::StreamAssistantItem(content) =
      item.map_err(|e| anyhow!(e.to_string()))?
      && let Some(delta) = reasoning_delta(&content)
    {
      session.append_thinking(&delta).await;
    }
  }
  Ok(())
}

/// Returns the reasoning delta carried by a `StreamedAssistantContent`
/// item, or `None` when the item is a text/tool/final variant. Treats
/// the non-delta `Reasoning(_)` variant as a single full-text delta -
/// providers that only emit the cumulative form will produce a single
/// thinking row whose body is the full trace.
fn reasoning_delta<R>(item: &StreamedAssistantContent<R>) -> Option<String> {
  match item {
    StreamedAssistantContent::Reasoning(reasoning) => {
      let text = reasoning.display_text();
      if text.is_empty() { None } else { Some(text) }
    }
    StreamedAssistantContent::ReasoningDelta { reasoning, .. } => {
      if reasoning.is_empty() {
        None
      } else {
        Some(reasoning.clone())
      }
    }
    _ => None,
  }
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

/// Streaming no-tool, no-hook turn. Used for history compaction where the
/// output is collected silently without broadcasting to the UI.
async fn run_no_hook_stream<M>(
  builder: AgentBuilder<M>,
  system_prompt: &str,
  user_prompt: String,
) -> Result<String>
where
  M: CompletionModel + 'static,
{
  let agent = builder.preamble(system_prompt).build();
  let mut stream = agent.stream_prompt(user_prompt).await;
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

// -- Context size fetching -------------------------------------------------

/// Fetches the context window size for the given provider configuration.
/// Results are not cached here — callers are expected to cache via
/// [`crate::app_state::AppState::context_size_cache`]. Falls back to
/// [`CONTEXT_SIZE_FALLBACK`] and logs an error when the API call fails.
pub async fn fetch_context_size(config: &ProviderConfig) -> u64 {
  match config.api_type {
    ApiType::Ollama => fetch_ollama_context_size(config)
      .await
      .report()
      .unwrap_or(CONTEXT_SIZE_FALLBACK),
    ApiType::OpenRouter => fetch_openrouter_context_size(config)
      .await
      .report()
      .unwrap_or(CONTEXT_SIZE_FALLBACK),
  }
}

async fn fetch_ollama_context_size(config: &ProviderConfig) -> Result<u64> {
  let base = config.base_url.trim().trim_end_matches('/');
  let base = base.strip_suffix("/v1").unwrap_or(base);
  let url = format!("{base}/api/show");
  let body = json!({ "model": config.model });
  let resp: serde_json::Value = reqwest::Client::new()
    .post(&url)
    .json(&body)
    .send()
    .await
    .context("Ollama /api/show request failed")?
    .json()
    .await
    .context("Ollama /api/show response parse failed")?;

  // model_info keys vary by architecture; look for any key ending in "context_length"
  if let Some(ctx) = resp["model_info"].as_object().and_then(|m| {
    m.iter()
      .find(|(k, _)| k.ends_with("context_length"))
      .and_then(|(_, v)| v.as_u64())
  }) {
    return Ok(ctx);
  }
  // Fallback: parse num_ctx from the parameters string
  if let Some(params) = resp["parameters"].as_str() {
    for line in params.lines() {
      let mut parts = line.split_whitespace();
      if parts.next() == Some("num_ctx")
        && let Some(n) = parts.next().and_then(|s| s.parse::<u64>().ok())
      {
        return Ok(n);
      }
    }
  }
  bail!(
    "context length not found in Ollama /api/show response for {}",
    config.model
  )
}

async fn fetch_openrouter_context_size(config: &ProviderConfig) -> Result<u64> {
  let base = config.base_url.trim().trim_end_matches('/');
  let base = if base.is_empty() {
    "https://openrouter.ai/api/v1"
  } else {
    base
  };
  let url = format!("{base}/models");
  let key = config
    .api_key
    .as_deref()
    .filter(|k| !k.is_empty())
    .ok_or_else(|| {
      anyhow!("OpenRouter api_key required for context size fetch")
    })?;
  let resp: serde_json::Value = reqwest::Client::new()
    .get(&url)
    .bearer_auth(key)
    .send()
    .await
    .context("OpenRouter /models request failed")?
    .json()
    .await
    .context("OpenRouter /models response parse failed")?;
  resp["data"]
    .as_array()
    .and_then(|arr| {
      arr
        .iter()
        .find(|m| m["id"].as_str() == Some(&config.model))
        .and_then(|m| m["context_length"].as_u64())
    })
    .ok_or_else(|| {
      anyhow!("model {} not found in OpenRouter /models", config.model)
    })
}

// -- History compaction ----------------------------------------------------

/// Calls the high-tier model to summarize `transcript` and returns the
/// summary text. Runs silently — no streaming to the UI. Called from the
/// background compaction task in `crate::runtime`.
pub async fn run_compact_transcript(
  config: &ProviderConfig,
  transcript: &str,
) -> Result<String> {
  let user_prompt = format!("Transcript to summarize:\n\n{transcript}");
  match config.api_type {
    ApiType::Ollama => {
      let client = OllamaChatClient::new(config)?;
      run_no_hook_stream(
        client
          .client
          .agent(&client.model)
          .additional_params(ollama_extra_params()),
        COMPACTION_PROMPT,
        user_prompt,
      )
      .await
    }
    ApiType::OpenRouter => {
      let client = OpenRouterChatClient::new(config)?;
      run_no_hook_stream(
        client
          .client
          .agent(&client.model)
          .additional_params(openrouter_extra_params()),
        COMPACTION_PROMPT,
        user_prompt,
      )
      .await
    }
  }
}
