//! `request_leader_decision` tool: a debater calls this when it wants
//! the leader to weigh in. The leader is invoked as a tool-loop turn
//! against the room's `high` provider with two tools available:
//!
//! - `pause_room` — flip [`crate::models::DebateState`] to `Paused`. The
//!   pause tool emits its own leader bubble carrying the reasoning, so
//!   when the leader chooses this option we suppress the on-demand
//!   verdict bubble.
//! - `get_inline_note_detail` — pull the click-to-reveal body of a
//!   transcript breadcrumb (e.g. a Python-run traceback) so the leader
//!   can ground its answer.
//!
//! When the leader does not pause, its final text is persisted as a
//! `leader_note` event so the user sees the verdict in the chat log,
//! and the same text is returned to the calling debater.

use crate::app_state::AppState;
use crate::db;
use crate::error::ReportError;
use crate::llm::{LeaderDecisionTurnInputs, build_chat_client};
use crate::models::{ProviderConfig, RoomEvent, RoomEventKind};
use crate::runtime::DebateHook;
use crate::streaming::{WsEvent, new_turn_id};
use crate::tools::InlineNote;
use crate::tools::get_inline_note_detail::GetInlineNoteDetailTool;
use crate::tools::pause_room::{LEADER_AGENT, PauseRoomTool};
use chrono::Utc;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

pub const NAME: &str = "request_leader_decision";
/// Inline-note label written before the leader's chat bubble. The leader
/// always speaks under the plain "Leader" name now; this breadcrumb is
/// what tells the user this particular bubble was triggered on demand by
/// a debater rather than by the periodic steering tick.
pub const INLINE_NOTE_TEXT: &str = "Appeared on demand";
pub const INLINE_NOTE_FAIL_TEXT: &str = "Leader request failed";

/// Embeds enough context to invoke the high model, persist the resulting
/// `leader_note`, and broadcast it to subscribed WS clients.
///
/// Constructed fresh per turn by the runtime; cheap to clone.
#[derive(Clone)]
pub struct RequestLeaderDecisionTool {
  state: AppState,
  room_code: String,
  /// Snapshot of the high-tier provider config taken at turn start. Stored
  /// verbatim so the call uses whatever the global settings say *now*.
  high_provider: ProviderConfig,
  /// Snapshot of the room's topic / goal etc. at turn start. Used to frame
  /// the leader prompt without an extra DB read.
  context_preamble: String,
  /// User-facing wake-schedule label, threaded through to
  /// [`PauseRoomTool`] so its default note references the right
  /// schedule when the leader pauses without supplying its own copy.
  schedule_label: String,
}

impl RequestLeaderDecisionTool {
  pub fn new(
    state: AppState,
    room_code: String,
    high_provider: ProviderConfig,
    context_preamble: String,
    schedule_label: String,
  ) -> Self {
    Self {
      state,
      room_code,
      high_provider,
      context_preamble,
      schedule_label,
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
      description: "Asks the room's leader (high model) to weigh in. \
                    Use this when the debate has hit an impasse, when an \
                    important judgment is needed, or when you think the \
                    discussion has plainly run its course and the room \
                    should pause. The leader can either return a verdict \
                    (recorded as a public `leader_note`) or pause the \
                    debate directly. Calling it frequently defeats its \
                    purpose."
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
    // The persona's outer hook already persists an inline-note for this
    // tool call via [`format_inline_note`], so we don't write a separate
    // breadcrumb here. We do attach a gate hook to the leader's
    // sub-turn so any tools the leader invokes (notably `pause_room`)
    // leave their own breadcrumbs and pause is observable.
    let stream = self.state.ensure_room_stream(&self.room_code).await;
    let hook = DebateHook::for_gate(
      stream,
      self.state.clone(),
      self.room_code.clone(),
      LEADER_AGENT.to_string(),
    );
    let recorder = hook.recorder();

    let pause_tool = PauseRoomTool::new(
      self.state.clone(),
      self.room_code.clone(),
      self.schedule_label.clone(),
    );
    let inline_note_tool =
      GetInlineNoteDetailTool::new(self.state.clone(), self.room_code.clone());

    let client = build_chat_client(&self.high_provider)
      .map_err(|e| LeaderDecisionError::Config(e.to_string()))?;
    let answer = client
      .run_leader_decision_turn(LeaderDecisionTurnInputs {
        system_prompt: self.system_prompt(),
        user_prompt: self.user_prompt(&args),
        pause_tool,
        inline_note_tool,
        hook,
      })
      .await
      .map_err(|e| LeaderDecisionError::Call(e.to_string()))?;

    let answer = answer.trim().to_string();
    let leader_paused = recorder.pause_room_called().await;

    // When the leader paused, `pause_room` already emitted a leader
    // bubble carrying the pause reasoning, so we suppress a second
    // bubble here. Otherwise the leader's verdict text becomes the
    // on-demand bubble.
    if !leader_paused && !answer.is_empty() {
      self.emit_verdict_bubble(&answer).await;
    }

    let output_answer = if answer.is_empty() && leader_paused {
      "Leader paused the debate.".to_string()
    } else {
      answer
    };
    Ok(LeaderDecisionOutput {
      answer: output_answer,
    })
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
       Use `get_inline_note_detail` if a transcript breadcrumb's body \
       (e.g. a Python traceback) is needed to ground your answer.\n\n{}",
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

  /// Persists the leader's verdict text as a `leader_note` row and
  /// broadcasts it. Used only on the non-pause path; when the leader
  /// pauses, `pause_room` writes its own bubble already.
  async fn emit_verdict_bubble(&self, content: &str) {
    let handle = {
      let handles = self.state.room_handles.read().await;
      handles.get(&self.room_code).cloned()
    };
    let Some(handle) = handle else {
      return;
    };
    let stream = self.state.ensure_room_stream(&self.room_code).await;
    let bubble_draft = RoomEvent {
      id: None,
      room_code: self.room_code.clone(),
      sequence: handle.allocate_event_sequence(),
      kind: RoomEventKind::LeaderNote,
      agent: Some(LEADER_AGENT.to_string()),
      content: content.to_string(),
      reasoning: String::new(),
      detail: String::new(),
      timestamp: Utc::now(),
    };
    let bubble_event = db::insert_event(&self.state.db, &bubble_draft)
      .await
      .report()
      .unwrap_or_else(|| bubble_draft.clone());

    stream.send(WsEvent::MessageAdded {
      turn_id: new_turn_id(),
      message: bubble_event,
    });
  }
}

/// Builds the inline-note attached to a `request_leader_decision`
/// invocation. The detail carries the question (and optional caller
/// context) so the user can see what was asked without scrolling; the
/// answer lives on the leader-bubble row this tool persists directly.
pub fn format_inline_note(args: &str, result: &str, ok: bool) -> InlineNote {
  if !ok {
    return InlineNote {
      text: INLINE_NOTE_FAIL_TEXT.to_string(),
      detail: result.to_string(),
    };
  }
  let detail = match serde_json::from_str::<LeaderDecisionArgs>(args) {
    Ok(parsed) => {
      let mut detail = format!("Question: {}", parsed.question.trim());
      if let Some(extra) = parsed.context.as_deref()
        && !extra.trim().is_empty()
      {
        detail.push_str("\n\nAdditional context:\n");
        detail.push_str(extra.trim());
      }
      detail
    }
    Err(_) => String::new(),
  };
  InlineNote {
    text: INLINE_NOTE_TEXT.to_string(),
    detail,
  }
}
