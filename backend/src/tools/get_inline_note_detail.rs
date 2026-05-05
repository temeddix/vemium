//! `get_inline_note_detail` tool: looks up the click-to-reveal `detail`
//! payload of an inline-note row by its `id`.
//!
//! The room transcript shows inline-note breadcrumbs in the form
//! `(inline-note #N by Author)` so personas can request the full body of
//! one when relevant - typically a Python-run failure with a long
//! traceback that would otherwise bloat the buffer if always inlined.
//!
//! Lookups are scoped to the calling room: an inline-note id from a
//! different room (or any non-inline event id) is treated as not found,
//! so personas cannot use this to peek across rooms.

use crate::app_state::AppState;
use crate::db;
use crate::tools::InlineNote;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

pub const NAME: &str = "get_inline_note_detail";
pub const INLINE_NOTE_FAIL_TEXT: &str = "Note lookup failed";

/// Embeds enough context to load an inline-note row scoped to the calling
/// room. Constructed fresh per turn; cheap to clone.
#[derive(Clone)]
pub struct GetInlineNoteDetailTool {
  state: AppState,
  room_code: String,
}

impl GetInlineNoteDetailTool {
  pub fn new(state: AppState, room_code: String) -> Self {
    Self { state, room_code }
  }
}

#[derive(Debug, Deserialize)]
pub struct GetInlineNoteDetailArgs {
  /// Numeric id printed next to the breadcrumb in the transcript, e.g.
  /// the `42` in `(inline-note #42 by Researcher)`.
  pub id: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetInlineNoteDetailOutput {
  pub id: i64,
  pub agent: Option<String>,
  pub label: String,
  pub detail: String,
  pub timestamp: String,
}

#[derive(Debug, Error)]
pub enum GetInlineNoteDetailError {
  #[error("inline note #{0} not found in this room")]
  NotFound(i64),
  #[error("failed to load inline note: {0}")]
  Load(String),
}

impl Tool for GetInlineNoteDetailTool {
  const NAME: &'static str = NAME;
  type Args = GetInlineNoteDetailArgs;
  type Output = GetInlineNoteDetailOutput;
  type Error = GetInlineNoteDetailError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Fetch the click-to-reveal `detail` body of an \
                    inline-note breadcrumb by its id. The transcript marks \
                    inline notes as `(inline-note #N by Author)`; pass the \
                    numeric `N` here when you need the full body (e.g. the \
                    traceback behind a `Python script run fail` note). \
                    Lookups are scoped to this room."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "integer",
            "description": "Numeric id from the inline-note breadcrumb."
          }
        },
        "required": ["id"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let event = db::load_inline_note(&self.state.db, args.id)
      .await
      .map_err(|e| GetInlineNoteDetailError::Load(e.to_string()))?;
    let event = event
      .filter(|event| event.room_code == self.room_code)
      .ok_or(GetInlineNoteDetailError::NotFound(args.id))?;

    Ok(GetInlineNoteDetailOutput {
      id: args.id,
      agent: event.agent,
      label: event.content,
      detail: event.detail,
      timestamp: event.timestamp.to_rfc3339(),
    })
  }
}

/// Builds the inline-note attached to a `get_inline_note_detail`
/// invocation. The label embeds the looked-up note id so a user scanning
/// the timeline can see what was being researched without clicking; the
/// detail body shows the full lookup result.
pub fn format_inline_note(args: &str, result: &str, ok: bool) -> InlineNote {
  let id = serde_json::from_str::<GetInlineNoteDetailArgs>(args)
    .map(|a| a.id)
    .ok();
  if !ok {
    let text = match id {
      Some(id) => format!("Failed to look up note #{id}"),
      None => INLINE_NOTE_FAIL_TEXT.to_string(),
    };
    return InlineNote {
      text,
      detail: result.to_string(),
    };
  }
  let text = match id {
    Some(id) => format!("Looked up note #{id}"),
    None => "Looked up an inline note".to_string(),
  };
  let detail = serde_json::from_str::<GetInlineNoteDetailOutput>(result)
    .ok()
    .map(|out| out.detail)
    .unwrap_or_default();
  InlineNote { text, detail }
}
