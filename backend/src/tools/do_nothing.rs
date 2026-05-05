//! `do_nothing` tool: an explicit opt-out signal usable by any persona or
//! the leader. Calling it terminates the turn without producing a chat
//! bubble; the `DebateHook` writes the public inline-note breadcrumb that
//! tells the user what happened.
//!
//! `reason` is required; it travels into the inline-note `detail` field so
//! the user only sees it on click and the timeline label stays terse.

use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

use crate::tools::InlineNote;

pub const NAME: &str = "do_nothing";
pub const INLINE_NOTE_TEXT: &str = "Decided to do nothing.";
pub const INLINE_NOTE_FAIL_TEXT: &str = "Tried to do nothing (failed)";

#[derive(Clone, Default)]
pub struct DoNothingTool;

impl DoNothingTool {
  pub fn new() -> Self {
    Self
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
    if args.reason.trim().is_empty() {
      return Err(DoNothingError::EmptyReason);
    }
    Ok(DoNothingOutput { acknowledged: true })
  }
}

/// Builds the inline-note attached to a `do_nothing` invocation. On success
/// the reason becomes the detail body; on failure the rig-provided error
/// string is shown instead.
pub fn format_inline_note(args: &str, result: &str, ok: bool) -> InlineNote {
  if !ok {
    return InlineNote {
      text: INLINE_NOTE_FAIL_TEXT.to_string(),
      detail: result.to_string(),
    };
  }
  let reason = serde_json::from_str::<DoNothingArgs>(args)
    .map(|args| args.reason.trim().to_string())
    .unwrap_or_default();
  InlineNote {
    text: INLINE_NOTE_TEXT.to_string(),
    detail: reason,
  }
}
