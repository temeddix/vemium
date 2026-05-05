//! Domain types for the Vemium backend.
//!
//! The world consists of:
//!
//! - [`Room`]: the canonical record of one debate subject. Each room has its
//!   own per-room knobs (topic, instruction, schedule cadences) but does
//!   *not* own provider configuration — that is process-global and lives in
//!   [`AppSettings`].
//! - [`RoomEvent`]: one finalized message in the room's chat log — a
//!   debater turn or a leader note. Each row owns the message text plus
//!   the model's reasoning trace and the inline list of tool calls
//!   executed during that turn.
//! - [`RoomReport`]: a periodic high-model summary of the room. Reports are
//!   first-class so the UI can list them independently of the chat log.
//! - [`AppSettings`]: process-wide low/high tier provider configuration,
//!   set once via the home-screen Settings page and shared by every room.
//!
//! Each room is identified by a Google-Meet style readable code (e.g.
//! `abc-defg-hij`). The code is the room's database primary key, the URL
//! segment, and the workspace directory name; there is no separate UUID.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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
#[serde(rename_all = "camelCase")]
pub enum ApiType {
  #[default]
  Ollama,
  OpenRouter,
}

/// Provider configuration for one tier (low or high). One of these is stored
/// for the low tier and one for the high tier as part of [`AppSettings`].
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
  /// settings persisted before this field existed continue to load.
  #[serde(default)]
  pub api_type: ApiType,
}

impl ProviderConfig {
  /// Returns a copy with `api_key` replaced by a fixed sentinel (`***`) when a
  /// key is stored, suitable for embedding in API responses. The sentinel
  /// signals "a key is set" without leaking any portion of it; if the client
  /// echoes it back unchanged the update path treats it as "keep existing".
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
  if secret.trim().is_empty() {
    return String::new();
  }
  REDACTED_API_KEY_SENTINEL.to_string()
}

/// Sentinel value returned in place of a stored API key. See
/// [`ProviderConfig::redacted`].
pub const REDACTED_API_KEY_SENTINEL: &str = "***";

/// Process-wide application settings. There is a single row in the
/// `app_settings` table; both tiers are mandatory once a user has saved at
/// least once. Reads are performed under a `RwLock` in
/// [`crate::app_state::AppState`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
  pub low: ProviderConfig,
  pub high: ProviderConfig,
  pub updated_at: DateTime<Utc>,
}

impl AppSettings {
  /// Public-API view with API keys redacted.
  pub fn view(&self) -> AppSettingsView {
    AppSettingsView {
      low: self.low.redacted(),
      high: self.high.redacted(),
      updated_at: self.updated_at,
    }
  }
}

/// Public API representation of [`AppSettings`] with secrets redacted.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsView {
  pub low: ProviderConfig,
  pub high: ProviderConfig,
  pub updated_at: DateTime<Utc>,
}

/// Input for `PUT /v1/settings`. Either tier may be omitted to leave the
/// stored value unchanged.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAppSettingsRequest {
  pub low: Option<ProviderConfig>,
  pub high: Option<ProviderConfig>,
}

/// Canonical record of a debate subject.
///
/// Provider configuration is process-global ([`AppSettings`]) — the room
/// only carries its own debate knobs. The orchestrator reads its per-loop
/// snapshot from this struct, so changes are eventually consistent.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Room {
  /// Readable identifier in `xxx-xxxx-xxx` lowercase letter format. Used as
  /// the database primary key, the URL segment, and the workspace directory
  /// name.
  pub code: String,
  pub topic: String,
  pub goal: String,
  pub instruction: Option<String>,
  pub status: RoomStatus,
  /// Sleep between consecutive debater turns, in seconds.
  pub chat_interval_seconds: u64,
  /// Cadence (in seconds) at which the leader emits a steering `leader_note`
  /// nudging the debate forward.
  pub steering_interval_seconds: u64,
  /// Cron expression that drives the long-form report cadence.
  pub report_schedule_cron: String,
  /// Human-readable label for `report_schedule_cron`, shown in leader notes.
  pub report_schedule_label: String,
  /// Wall-clock cap (seconds) for a single Python script execution.
  pub python_timeout_seconds: u64,
  /// If true, the runtime can pause the room when all personas converge
  /// with no further contributions and the leader approves the halt.
  pub auto_pause_when_converged: bool,
  /// Cron expression used for scheduled wake checks while auto-paused.
  pub resume_schedule_cron: String,
  /// Human-readable label for `resume_schedule_cron`, shown in leader notes.
  pub resume_schedule_label: String,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

impl Room {
  /// Returns the public-API view of the room. Identical shape today but
  /// kept as a separate type so future fields can diverge (e.g. derived
  /// status flags) without breaking the wire format.
  pub fn view(&self) -> RoomView {
    RoomView {
      code: self.code.clone(),
      topic: self.topic.clone(),
      goal: self.goal.clone(),
      instruction: self.instruction.clone(),
      status: self.status,
      chat_interval_seconds: self.chat_interval_seconds,
      steering_interval_seconds: self.steering_interval_seconds,
      report_schedule_cron: self.report_schedule_cron.clone(),
      report_schedule_label: self.report_schedule_label.clone(),
      python_timeout_seconds: self.python_timeout_seconds,
      auto_pause_when_converged: self.auto_pause_when_converged,
      resume_schedule_cron: self.resume_schedule_cron.clone(),
      resume_schedule_label: self.resume_schedule_label.clone(),
      created_at: self.created_at,
      updated_at: self.updated_at,
    }
  }
}

/// Public API representation of a [`Room`]. The wire format is camelCase JSON.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomView {
  pub code: String,
  pub topic: String,
  pub goal: String,
  pub instruction: Option<String>,
  pub status: RoomStatus,
  pub chat_interval_seconds: u64,
  pub steering_interval_seconds: u64,
  pub report_schedule_cron: String,
  pub report_schedule_label: String,
  pub python_timeout_seconds: u64,
  pub auto_pause_when_converged: bool,
  pub resume_schedule_cron: String,
  pub resume_schedule_label: String,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
}

/// Categorisation of a row in `room_events`. All kinds are part of the
/// LLM-visible transcript and are rendered as message bubbles by the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoomEventKind {
  /// A debater (low-model persona) finished a turn.
  AgentChat,
  /// The leader (high-model) emitted a steering note.
  LeaderNote,
  /// The human operator injected a message into the room. The orchestrator
  /// picks it up like any other transcript entry on the next turn.
  UserChat,
}

impl RoomEventKind {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::AgentChat => "agent_chat",
      Self::LeaderNote => "leader_note",
      Self::UserChat => "user_chat",
    }
  }

  pub fn parse(value: &str) -> anyhow::Result<Self> {
    match value {
      "agent_chat" => Ok(Self::AgentChat),
      "leader_note" => Ok(Self::LeaderNote),
      "user_chat" => Ok(Self::UserChat),
      other => Err(anyhow::anyhow!("unknown room event kind: {other}")),
    }
  }
}

/// One finalized message in a room's chat log. The text content, the
/// model's reasoning trace, and every tool call executed during the turn
/// all live on the same row — there are no separate `tool_call` rows. The
/// room's full visible history is the ordered list of these joined with
/// [`RoomReport`] entries.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomEvent {
  pub room_code: String,
  pub sequence: u64,
  pub kind: RoomEventKind,
  pub agent: Option<String>,
  pub content: String,
  /// Model's chain-of-thought for this turn. Empty when the model emitted
  /// none, or when the provider doesn't expose reasoning separately.
  #[serde(default)]
  pub reasoning: String,
  /// Tools invoked during this turn, in invocation order. Empty when the
  /// turn called no tools.
  #[serde(default)]
  pub tool_calls: Vec<ToolCallRecord>,
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
  pub room_code: String,
  pub sequence: u64,
  pub content: String,
  pub started_at: DateTime<Utc>,
  pub completed_at: Option<DateTime<Utc>>,
  pub status: ReportStatus,
}

/// One tool invocation that happened during a debater turn. Embedded inline
/// in [`RoomEvent::tool_calls`] so the message and its tool calls travel
/// together. Both the input arguments and the (truncated) output are kept
/// so the UI can render a useful debug view without re-running the tool.
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

/// Input for `POST /v1/rooms`. Topic and goal are required; the optional
/// fields fall back to `crate::config::room_defaults`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRoomRequest {
  pub topic: String,
  pub goal: String,
  pub instruction: Option<String>,
  pub chat_interval_seconds: Option<u64>,
  pub steering_interval_seconds: Option<u64>,
  pub report_schedule_cron: Option<String>,
  pub report_schedule_label: Option<String>,
  pub python_timeout_seconds: Option<u64>,
  pub auto_pause_when_converged: Option<bool>,
  pub resume_schedule_cron: Option<String>,
  pub resume_schedule_label: Option<String>,
}

/// Input for `POST /v1/rooms/:code/messages`. Carries one human-authored
/// message to inject into the room's transcript so the AI personas can
/// react to it on the next turn.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessageRequest {
  pub content: String,
}

/// Input for `PATCH /v1/rooms/:code`. Every field is optional; absent fields
/// leave the room's current value unchanged.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRoomRequest {
  pub topic: Option<String>,
  pub goal: Option<String>,
  pub instruction: Option<Option<String>>,
  pub chat_interval_seconds: Option<u64>,
  pub steering_interval_seconds: Option<u64>,
  pub report_schedule_cron: Option<String>,
  pub report_schedule_label: Option<String>,
  pub python_timeout_seconds: Option<u64>,
  pub auto_pause_when_converged: Option<bool>,
  pub resume_schedule_cron: Option<String>,
  pub resume_schedule_label: Option<String>,
}
