//! `request_leader_decision` tool: a debater calls this when it wants the
//! leader to weigh in. The leader runs a fresh sub-turn against the high
//! model with its own [`TurnSession`], producing its own thinking /
//! balloon / inline-note rows.

use crate::app_state::AppState;
use crate::event_log::EventLog;
use crate::llm::{LeaderDecisionTurnInputs, build_chat_client};
use crate::models::{ProviderConfig, RoomEventKind};
use crate::runtime::TurnSession;
use crate::tools::get_room_event::GetRoomEventTool;
use crate::tools::pause_room::{LEADER_AGENT, PauseRoomTool};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use thiserror::Error;

pub const NAME: &str = "request_leader_decision";
pub const INLINE_NOTE_TEXT: &str = "Requested a decision from the leader";
pub const INLINE_NOTE_FAIL_TEXT: &str = "Failed to request leader decision";

#[derive(Clone)]
pub struct RequestLeaderDecisionTool {
  state: AppState,
  room_code: String,
  high_provider: ProviderConfig,
  context_preamble: String,
  schedule_label: String,
  log: EventLog,
  /// Author label for the persona-side breadcrumb (the debater who
  /// invoked the leader). The leader's own rows always speak as
  /// [`LEADER_AGENT`].
  caller_author: String,
}

impl RequestLeaderDecisionTool {
  pub fn new(
    state: AppState,
    room_code: String,
    high_provider: ProviderConfig,
    context_preamble: String,
    schedule_label: String,
    log: EventLog,
    caller_author: String,
  ) -> Self {
    Self {
      state,
      room_code,
      high_provider,
      context_preamble,
      schedule_label,
      log,
      caller_author,
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
}

impl Tool for RequestLeaderDecisionTool {
  const NAME: &'static str = NAME;
  type Args = LeaderDecisionArgs;
  type Output = LeaderDecisionOutput;
  type Error = LeaderDecisionError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Asks the room's leader (high model) to weigh in. Use \
                    when the debate has hit an impasse, an important \
                    judgment is needed, or the discussion has plainly run \
                    its course. The leader can return a verdict (recorded \
                    as a public `leader_note` bubble) or pause the debate \
                    directly. When in doubt, escalate — the leader can \
                    always redirect if the moment is not right."
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
    let detail = build_lookup_detail(&args);
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.caller_author.clone()),
        INLINE_NOTE_TEXT.to_string(),
        detail.clone(),
      )
      .await;

    let leader_session = Arc::new(TurnSession::new(
      self.log.clone(),
      LEADER_AGENT.to_string(),
      RoomEventKind::LeaderNote,
    ));
    let pause_tool = PauseRoomTool::new(
      self.state.clone(),
      self.room_code.clone(),
      self.schedule_label.clone(),
      self.log.clone(),
    );
    let room_event_tool = GetRoomEventTool::new(
      self.state.clone(),
      self.room_code.clone(),
      self.log.clone(),
      LEADER_AGENT.to_string(),
    );

    let client = match build_chat_client(&self.high_provider) {
      Ok(client) => client,
      Err(error) => {
        row
          .replace_body(INLINE_NOTE_FAIL_TEXT.to_string(), error.to_string())
          .await;
        row.finish(false).await;
        return Err(LeaderDecisionError::Config(error.to_string()));
      }
    };
    let outcome = client
      .run_leader_decision_turn(LeaderDecisionTurnInputs {
        system_prompt: self.system_prompt(),
        user_prompt: self.user_prompt(&args),
        pause_tool,
        room_event_tool,
        session: leader_session.clone(),
      })
      .await;
    leader_session.finish(outcome.is_ok()).await;

    match outcome {
      Ok(answer) => {
        let answer = answer.trim().to_string();
        row.finish(true).await;
        Ok(LeaderDecisionOutput { answer })
      }
      Err(error) => {
        row
          .replace_body(INLINE_NOTE_FAIL_TEXT.to_string(), error.to_string())
          .await;
        row.finish(false).await;
        Err(LeaderDecisionError::Call(error.to_string()))
      }
    }
  }
}

impl RequestLeaderDecisionTool {
  fn system_prompt(&self) -> String {
    format!(
      "You are the Leader of this debate room. A debater has asked you \
       to weigh in. Choose one of two responses:\n\n\
       1. If the question deserves a substantive verdict, reply with a \
       crisp judgment - one or two paragraphs at most. Take a clear \
       position; hedging defeats the purpose.\n\
       2. If the discussion has plainly run its course, or further turns \
       would be wasteful, call `pause_room` to pause the debate. The \
       resume scheduler will check whether to wake it on its own \
       cadence.\n\n\
       Use `get_room_event` if a transcript event's body \
       (e.g. a Python traceback or a compacted message) is needed to \
       ground your answer.\n\n{}",
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
}

fn build_lookup_detail(args: &LeaderDecisionArgs) -> String {
  let mut detail = format!("Question: {}", args.question.trim());
  if let Some(extra) = args.context.as_deref()
    && !extra.trim().is_empty()
  {
    detail.push_str("\n\nAdditional context:\n");
    detail.push_str(extra.trim());
  }
  detail
}
