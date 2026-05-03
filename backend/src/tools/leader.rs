//! `request_leader_decision` tool: agents call this when they need a high-
//! model judgment to break a tie or settle an important question.
//!
//! The tool runs a one-off non-streaming completion against the room's
//! `high` provider via the [`rig::agent::Agent`] API, persists the response
//! as a `leader_note` event so the user can see it in the chat log, and
//! returns the same text to the calling agent so it can reference the
//! leader's verdict in its own reply.

use crate::app_state::AppState;
use crate::db;
use crate::error::ReportError;
use crate::llm::build_chat_client;
use crate::models::{ProviderConfig, RoomEvent, RoomEventKind};
use crate::streaming::{TurnKind, WsEvent, new_turn_id};
use chrono::Utc;
use rig::client::CompletionClient;
use rig::completion::{Prompt, ToolDefinition};
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;
use uuid::Uuid;

const NAME: &str = "request_leader_decision";
const LEADER_AGENT_LABEL: &str = "Leader (on demand)";

/// Embeds enough context to invoke the high model, persist the resulting
/// `leader_note`, and broadcast it to subscribed WS clients.
///
/// Constructed fresh per turn by the runtime; cheap to clone.
#[derive(Clone)]
pub struct RequestLeaderDecisionTool {
  state: AppState,
  room_id: Uuid,
  /// Snapshot of the high-tier provider config taken at turn start. Stored
  /// verbatim so the call uses whatever the room's settings say *now*.
  high_provider: ProviderConfig,
  /// The `high.model` from the same snapshot. Stored separately to avoid
  /// re-cloning the config when calling.
  high_model: String,
  /// Snapshot of the room's topic / goal etc. at turn start. Used to frame
  /// the leader prompt without an extra DB read.
  context_preamble: String,
}

impl RequestLeaderDecisionTool {
  pub fn new(
    state: AppState,
    room_id: Uuid,
    high_provider: ProviderConfig,
    context_preamble: String,
  ) -> Self {
    let high_model = high_provider.model.clone();
    Self {
      state,
      room_id,
      high_provider,
      high_model,
      context_preamble,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct LeaderDecisionArgs {
  /// What the calling agent wants the leader to decide on. Should be a
  /// concrete question, not a request for a long essay.
  pub question: String,
  /// Optional extra context beyond what is in the room transcript (e.g.
  /// the data the agent just gathered).
  #[serde(default)]
  pub context: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LeaderDecisionOutput {
  pub answer: String,
}

#[derive(Debug, Error)]
pub enum LeaderDecisionError {
  #[error("invalid high-provider config: {0}")]
  Config(String),
  #[error("leader call failed: {0}")]
  Call(String),
  #[error("leader returned empty response")]
  Empty,
}

impl Tool for RequestLeaderDecisionTool {
  const NAME: &'static str = NAME;
  type Args = LeaderDecisionArgs;
  type Output = LeaderDecisionOutput;
  type Error = LeaderDecisionError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Requests a one-off decision from the room's leader \
                    (high model). Use this only when the debate has reached \
                    an impasse or an important judgment is needed; calling \
                    it frequently defeats its purpose. The leader's reply \
                    is recorded as a public `leader_note` and also returned \
                    to you so you can reference it."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "question": {
            "type": "string",
            "description": "The decision needed, phrased as a single question."
          },
          "context": {
            "type": "string",
            "description": "Optional extra context the leader should consider."
          }
        },
        "required": ["question"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let preamble = self.system_prompt();
    let user = self.user_prompt(&args);

    let client = build_chat_client(&self.high_provider)
      .map_err(|e| LeaderDecisionError::Config(e.to_string()))?;

    let answer = client
      .agent(&self.high_model)
      .preamble(&preamble)
      .build()
      .prompt(user)
      .await
      .map_err(|e| LeaderDecisionError::Call(e.to_string()))?;

    let answer = answer.trim().to_string();
    if answer.is_empty() {
      return Err(LeaderDecisionError::Empty);
    }

    self.persist_and_broadcast(&answer).await;
    Ok(LeaderDecisionOutput { answer })
  }
}

impl RequestLeaderDecisionTool {
  fn system_prompt(&self) -> String {
    format!(
      "You are the Leader of this debate room. Your role is to issue \
       crisp, decisive judgments when the debaters request one. Be \
       short - one or two paragraphs at most. Take a clear position; \
       hedging defeats the purpose.\n\n{}",
      self.context_preamble,
    )
  }

  fn user_prompt(&self, args: &LeaderDecisionArgs) -> String {
    let mut user = format!("Question: {}", args.question);
    if let Some(extra) = args.context.as_deref()
      && !extra.trim().is_empty()
    {
      user.push_str("\n\nAdditional context:\n");
      user.push_str(extra);
    }
    user
  }

  /// Best-effort: persist the leader's reply as a `leader_note` event and
  /// emit a WS turn so subscribers see it without waiting for a refresh.
  /// Failures are logged but do not propagate - the calling agent already
  /// has the answer in hand.
  async fn persist_and_broadcast(&self, content: &str) {
    let handle = {
      let handles = self.state.room_handles.read().await;
      handles.get(&self.room_id).cloned()
    };
    let Some(handle) = handle else {
      return;
    };
    let sequence = handle.allocate_event_sequence();
    let timestamp = Utc::now();
    let event = RoomEvent {
      room_id: self.room_id,
      sequence,
      kind: RoomEventKind::LeaderNote,
      agent: Some(LEADER_AGENT_LABEL.to_string()),
      content: content.to_string(),
      timestamp,
    };

    db::insert_event(&self.state.db, &event).await.report();

    let sender = self.state.ensure_room_stream(self.room_id).await;
    let turn_id = new_turn_id();
    let _ = sender.send(WsEvent::TurnStarted {
      turn_id: turn_id.clone(),
      agent: LEADER_AGENT_LABEL.to_string(),
      kind: TurnKind::LeaderNote,
    });
    let _ = sender.send(WsEvent::TurnCompleted {
      turn_id,
      sequence,
      agent: LEADER_AGENT_LABEL.to_string(),
      content: content.to_string(),
      timestamp,
    });
  }
}
