//! `do_nothing` tool: an explicit opt-out signal usable by any persona or
//! the leader. Persists a short inline-note breadcrumb explaining why no
//! further action was taken; does not produce a chat bubble. The tool
//! creates and finalizes its own inline-note row through [`EventLog`].

use crate::event_log::EventLog;
use crate::models::{RoomEventKind, RowStatus};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

pub const NAME: &str = "do_nothing";
pub const INLINE_NOTE_TEXT: &str = "Decided to do nothing.";

#[derive(Clone)]
pub struct DoNothingTool {
  log: EventLog,
  author: String,
}

impl DoNothingTool {
  pub fn new(log: EventLog, author: String) -> Self {
    Self { log, author }
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
      self
        .log
        .record_finalized(
          RoomEventKind::InlineNote,
          Some(self.author.clone()),
          "Tried to do nothing (failed)".to_string(),
          "reason must not be empty".to_string(),
        )
        .await;
      return Err(DoNothingError::EmptyReason);
    }
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        INLINE_NOTE_TEXT.to_string(),
        reason,
      )
      .await;
    row.finish(RowStatus::Done).await;
    Ok(DoNothingOutput { acknowledged: true })
  }
}
