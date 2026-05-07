//! `get_inline_note_detail` tool: looks up the click-to-reveal `detail`
//! payload of an inline-note row by its `id`. Lookups are scoped to the
//! calling room. The tool persists its own breadcrumb noting which id
//! was queried; the result is also returned to the model.

use crate::app_state::AppState;
use crate::db;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

pub const NAME: &str = "get_inline_note_detail";

#[derive(Clone)]
pub struct GetInlineNoteDetailTool {
  state: AppState,
  room_code: String,
  log: EventLog,
  author: String,
}

impl GetInlineNoteDetailTool {
  pub fn new(
    state: AppState,
    room_code: String,
    log: EventLog,
    author: String,
  ) -> Self {
    Self {
      state,
      room_code,
      log,
      author,
    }
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
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Looked up note #{}", args.id),
        String::new(),
      )
      .await;

    let lookup = db::load_inline_note(&self.state.db, args.id)
      .await
      .map_err(|e| GetInlineNoteDetailError::Load(e.to_string()));
    match lookup {
      Ok(Some(event)) if event.room_code == self.room_code => {
        row
          .replace_body(row_label(args.id), event.detail.clone())
          .await;
        row.finish().await;
        Ok(GetInlineNoteDetailOutput {
          id: args.id,
          agent: event.agent,
          label: event.content,
          detail: event.detail,
          timestamp: event.timestamp.to_rfc3339(),
        })
      }
      Ok(_) => {
        row
          .replace_body(
            format!("Failed to look up note #{}", args.id),
            format!("inline note #{} not found in this room", args.id),
          )
          .await;
        row.finish().await;
        Err(GetInlineNoteDetailError::NotFound(args.id))
      }
      Err(error) => {
        row
          .replace_body(
            format!("Failed to look up note #{}", args.id),
            error.to_string(),
          )
          .await;
        row.finish().await;
        Err(error)
      }
    }
  }
}

fn row_label(id: i64) -> String {
  format!("Looked up note #{id}")
}
