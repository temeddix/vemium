//! `do_nothing` tool: an explicit opt-out signal usable by any persona or
//! the leader. Calling it produces an inline note (dim text in the timeline)
//! instead of a chat bubble. The caller's textual reply is discarded.
//!
//! `reason` is required; the UI surfaces it only when the user clicks the
//! note, so it can be a short justification without bloating the timeline.

use crate::app_state::AppState;
use crate::streaming::WsEvent;
use chrono::Utc;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;
use uuid::Uuid;

const NAME: &str = "do_nothing";
const INLINE_NOTE_TEXT: &str = "Decided to do nothing.";

/// Embeds enough context to emit an inline note attributed to a specific
/// author. Constructed fresh per turn / gate run; cheap to clone.
#[derive(Clone)]
pub struct DoNothingTool {
  state: AppState,
  room_id: Uuid,
  /// Author label used for the inline note. Personas pass their own name;
  /// the gates pass `Leader (halt)` / `Leader (proceed)`.
  author: String,
}

impl DoNothingTool {
  pub fn new(state: AppState, room_id: Uuid, author: String) -> Self {
    Self {
      state,
      room_id,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct DoNothingArgs {
  /// Short justification shown to the user when they click the inline note.
  pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct DoNothingOutput {
  pub acknowledged: bool,
}

#[derive(Debug, Error)]
pub enum DoNothingError {
  #[error("reason must not be empty")]
  EmptyReason,
}

impl Tool for DoNothingTool {
  const NAME: &'static str = NAME;
  type Args = DoNothingArgs;
  type Output = DoNothingOutput;
  type Error = DoNothingError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Opt out of this turn. Use when you have nothing \
                    substantive to add or you decide that no further action \
                    is needed right now. The room timeline shows a small \
                    dim breadcrumb instead of a chat bubble; any text you \
                    would have produced is discarded. Provide a short \
                    `reason` so the user can see why if they click the \
                    breadcrumb."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "reason": {
            "type": "string",
            "description": "One sentence explaining why you have nothing to add."
          }
        },
        "required": ["reason"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let reason = args.reason.trim().to_string();
    if reason.is_empty() {
      return Err(DoNothingError::EmptyReason);
    }

    let stream = self.state.ensure_room_stream(self.room_id).await;
    stream.send(WsEvent::InlineNote {
      author: self.author.clone(),
      text: INLINE_NOTE_TEXT.to_string(),
      reason,
      timestamp: Utc::now(),
    });

    Ok(DoNothingOutput { acknowledged: true })
  }
}
