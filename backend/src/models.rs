//! Domain types for the Vemium backend.
//!
//! The world consists of:
//!
//! - [`Room`]: the canonical record of one debate subject. Each room has its
//!   own settings (including provider configuration) and runs an endless
//!   pause/resume-able orchestration.
//! - [`RoomEvent`]: an append-only entry in the room's visible chat log
//!   (debater turn, leader note, tool call, system message, ...).
//! - [`RoomReport`]: a periodic high-model summary of the room. Reports are
//!   first-class so the UI can list them independently of the chat log.
//! - [`ProviderConfig`]: per-tier (low / high) LLM provider configuration
//!   stored on the room. API keys live alongside the room in SQLite; never
//!   emit them through the public API without going through [`Room::view`].

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Lifecycle state of a [`Room`].
///
/// Rooms are intentionally endless — there is no terminal "completed" state.
/// A room only stops if the user pauses it, deletes it, or it fails.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoomStatus {
  /// Orchestrator is running and debaters are speaking on cadence.
  Active,
  /// Orchestrator is suspended at a turn boundary; no LLM calls are issued.
  Paused,
  /// Orchestrator hit an unrecoverable error. The room remains visible for
  /// inspection but does not advance.
  Failed,
}

impl RoomStatus {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Active => "active",
      Self::Paused => "paused",
      Self::Failed => "failed",
    }
  }

  pub fn parse(value: &str) -> anyhow::Result<Self> {
    match value {
      "active" => Ok(Self::Active),
      "paused" => Ok(Self::Paused),
      "failed" => Ok(Self::Failed),
      other => Err(anyhow::anyhow!("unknown room status: {other}")),
    }
  }
}

/// Which provider family a [`ProviderConfig`] targets. Each value selects a
/// different rig client at runtime (see `crate::llm::build_chat_client`):
///
/// - [`ApiType::Ollama`]: rig's native Ollama client (`/api/chat`, NDJSON).
///   Covers Ollama itself plus any other server that exposes the same native
///   protocol. `base_url` should point at the server root (e.g.
///   `http://localhost:11434`); `api_key` is optional.
/// - [`ApiType::OpenRouter`]: rig's OpenRouter client. `base_url` is normally
///   `https://openrouter.ai/api/v1` but is left configurable for proxies;
///   `api_key` is required.
#[derive(
  Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize,
)]
#[serde(rename_all = "snake_case")]
pub enum ApiType {
  #[default]
  Ollama,
  OpenRouter,
}

/// Per-tier provider configuration for a room. One [`ProviderConfig`] is
/// stored for each of the low and high tiers.
///
/// Validation happens in `crate::routes::validate_provider_config`; client
/// construction lives in `crate::llm`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
  pub model: String,
  /// Endpoint root. For Ollama, the server root (e.g.
  /// `http://localhost:11434`). For OpenRouter, the API base (normally
  /// `https://openrouter.ai/api/v1`).
  pub base_url: String,
  /// Bearer token. Plaintext in storage - do not return through the public
  /// API without redaction. Required for OpenRouter; optional for Ollama.
  #[serde(default)]
  pub api_key: Option<String>,
  /// Which provider family to use. Defaults to [`ApiType::Ollama`] so older
  /// rooms persisted before this field existed continue to load.
  #[serde(default)]
  pub api_type: ApiType,
}

impl ProviderConfig {
  /// Returns a copy with `api_key` replaced by a short masked preview, suitable
  /// for embedding in API responses.
  pub fn redacted(&self) -> Self {
    Self {
      model: self.model.clone(),
      base_url: self.base_url.clone(),
      api_key: self.api_key.as_deref().map(redact_secret),
      api_type: self.api_type,
    }
  }
}

fn redact_secret(secret: &str) -> String {
  let trimmed = secret.trim();
  if trimmed.is_empty() {
    return String::new();
  }
  let visible = trimmed.chars().rev().take(4).collect::<String>();
  let visible = visible.chars().rev().collect::<String>();
  format!("***{visible}")
}

/// Canonical record of a debate subject.
///
/// All fields are set at creation time; settings can be updated via PATCH and
/// take effect at the next orchestrator tick. The orchestrator reads its
/// per-loop snapshot from this struct, so changes are eventually consistent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Room {
  pub id: Uuid,
  pub name: String,
  /// Filesystem-safe stable identifier. Used as the directory name under
  /// `/data/debate/<slug>/`. Uniquely indexed in the database.
  pub slug: String,
  pub topic: String,
  pub goal: String,
  pub instruction: Option<String>,
  pub background: Option<String>,
  pub status: RoomStatus,
  /// Sleep between consecutive debater turns, in seconds.
  pub chat_interval_seconds: u64,
  /// Cadence (in seconds) at which the leader emits a `leader_note`.
  pub evaluation_interval_seconds: u64,
  /// Cadence (in seconds) at which the leader emits a long-form report.
  pub report_interval_seconds: u64,
  /// Wall-clock cap (seconds) for a single Python script execution.
  pub python_timeout_seconds: u64,
  /// Every N failed Python attempts, the runner injects a summary message
  /// back into the debate so other personas can vote on continuing.
  pub python_feedback_every: u32,
  pub low: ProviderConfig,
  pub high: ProviderConfig,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

impl Room {
  /// Returns a public-API view of the room with provider API keys redacted.
  pub fn view(&self) -> RoomView {
    RoomView {
      id: self.id,
      name: self.name.clone(),
      slug: self.slug.clone(),
      topic: self.topic.clone(),
      goal: self.goal.clone(),
      instruction: self.instruction.clone(),
      background: self.background.clone(),
      status: self.status,
      chat_interval_seconds: self.chat_interval_seconds,
      evaluation_interval_seconds: self.evaluation_interval_seconds,
      report_interval_seconds: self.report_interval_seconds,
      python_timeout_seconds: self.python_timeout_seconds,
      python_feedback_every: self.python_feedback_every,
      low: self.low.redacted(),
      high: self.high.redacted(),
      created_at: self.created_at,
      updated_at: self.updated_at,
    }
  }
}

/// Public API representation of a [`Room`] with secrets redacted. Identical
/// shape to `Room` minus the API keys; the wire format is camelCase JSON.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomView {
  pub id: Uuid,
  pub name: String,
  pub slug: String,
  pub topic: String,
  pub goal: String,
  pub instruction: Option<String>,
  pub background: Option<String>,
  pub status: RoomStatus,
  pub chat_interval_seconds: u64,
  pub evaluation_interval_seconds: u64,
  pub report_interval_seconds: u64,
  pub python_timeout_seconds: u64,
  pub python_feedback_every: u32,
  pub low: ProviderConfig,
  pub high: ProviderConfig,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

/// Categorisation of a row in `room_events`.
///
/// The kind controls how the UI renders the entry and whether the orchestrator
/// includes it in the LLM-visible transcript (currently: `agent_chat` and
/// `leader_note` are part of the transcript; the rest are status/UI only).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoomEventKind {
  /// A debater (low-model persona) finished a turn.
  AgentChat,
  /// The leader (high-model) emitted a steering note.
  LeaderNote,
  /// A tool call resolved. `content` is JSON `ToolCallRecord`.
  ToolCall,
  /// Free-form status line from the orchestrator (e.g. "Resumed").
  Phase,
  /// System-level error or notice not tied to a specific agent.
  System,
}

impl RoomEventKind {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::AgentChat => "agent_chat",
      Self::LeaderNote => "leader_note",
      Self::ToolCall => "tool_call",
      Self::Phase => "phase",
      Self::System => "system",
    }
  }

  pub fn parse(value: &str) -> anyhow::Result<Self> {
    match value {
      "agent_chat" => Ok(Self::AgentChat),
      "leader_note" => Ok(Self::LeaderNote),
      "tool_call" => Ok(Self::ToolCall),
      "phase" => Ok(Self::Phase),
      "system" => Ok(Self::System),
      other => Err(anyhow::anyhow!("unknown room event kind: {other}")),
    }
  }
}

/// A persisted log entry. The room's full chat history is the ordered list of
/// these rows joined with [`RoomReport`] entries.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomEvent {
  pub room_id: Uuid,
  pub sequence: u64,
  pub kind: RoomEventKind,
  pub agent: Option<String>,
  pub content: String,
  pub timestamp: DateTime<Utc>,
}

/// Lifecycle state of a [`RoomReport`]. Reports are streamed token-by-token
/// while `Streaming` and finalized to `Done` (or `Failed`) once the high
/// model returns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReportStatus {
  Streaming,
  Done,
  Failed,
}

impl ReportStatus {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Streaming => "streaming",
      Self::Done => "done",
      Self::Failed => "failed",
    }
  }

  pub fn parse(value: &str) -> anyhow::Result<Self> {
    match value {
      "streaming" => Ok(Self::Streaming),
      "done" => Ok(Self::Done),
      "failed" => Ok(Self::Failed),
      other => Err(anyhow::anyhow!("unknown report status: {other}")),
    }
  }
}

/// A persisted leader report. `content` is the full markdown body once the
/// stream completes; while streaming, the live deltas are broadcast over
/// WebSocket only.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomReport {
  pub id: i64,
  pub room_id: Uuid,
  pub sequence: u64,
  pub content: String,
  pub started_at: DateTime<Utc>,
  pub completed_at: Option<DateTime<Utc>>,
  pub status: ReportStatus,
}

/// JSON payload stored in `RoomEvent.content` when `kind == ToolCall`.
///
/// Both the input arguments and the (truncated) output are kept so the UI can
/// render a useful debug view without re-running the tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRecord {
  pub tool: String,
  pub args: serde_json::Value,
  pub ok: bool,
  pub output_preview: String,
  pub duration_ms: u64,
}

// -- Request DTOs ----------------------------------------------------------

/// Input for `POST /v1/rooms`. All fields are required except the optional
/// instruction/background strings; defaults for the per-room knobs come from
/// `crate::config::room_defaults`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRoomRequest {
  pub name: String,
  pub topic: String,
  pub goal: String,
  pub instruction: Option<String>,
  pub background: Option<String>,
  pub chat_interval_seconds: Option<u64>,
  pub evaluation_interval_seconds: Option<u64>,
  pub report_interval_seconds: Option<u64>,
  pub python_timeout_seconds: Option<u64>,
  pub python_feedback_every: Option<u32>,
  pub low: ProviderConfig,
  pub high: ProviderConfig,
}

/// Input for `PATCH /v1/rooms/:id`. Every field is optional; absent fields
/// leave the room's current value unchanged.
///
/// Provider configuration is replaced wholesale — there is no partial provider
/// patching, since a half-updated provider would be surprising.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRoomRequest {
  pub name: Option<String>,
  pub topic: Option<String>,
  pub goal: Option<String>,
  pub instruction: Option<Option<String>>,
  pub background: Option<Option<String>>,
  pub chat_interval_seconds: Option<u64>,
  pub evaluation_interval_seconds: Option<u64>,
  pub report_interval_seconds: Option<u64>,
  pub python_timeout_seconds: Option<u64>,
  pub python_feedback_every: Option<u32>,
  pub low: Option<ProviderConfig>,
  pub high: Option<ProviderConfig>,
}
