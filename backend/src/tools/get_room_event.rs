//! `get_room_event` tool: looks up any room-event row by its `id`, scoped to
//! the calling room. Useful after compaction, when old bubble or inline-note
//! content is no longer in the live transcript but can still be retrieved by
//! the numeric `#N` id embedded in the summary text.

use crate::app_state::AppState;
use crate::db;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

pub const NAME: &str = "get_room_event";

#[derive(Clone)]
pub struct GetRoomEventTool {
  state: AppState,
  room_code: String,
  log: EventLog,
  author: String,
}

impl GetRoomEventTool {
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
pub struct GetRoomEventArgs {
  /// Numeric id from the transcript, e.g. the `42` in `(inline-note #42 by
  /// Researcher)` or the `#42` embedded in a compaction summary.
  pub id: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GetRoomEventOutput {
  pub id: i64,
  pub kind: String,
  pub agent: Option<String>,
  pub content: String,
  pub detail: String,
  pub timestamp: String,
}

#[derive(Debug, Error)]
pub enum GetRoomEventError {
  #[error("event #{0} not found in this room")]
  NotFound(i64),
  #[error("failed to load event: {0}")]
  Load(String),
}

impl Tool for GetRoomEventTool {
  const NAME: &'static str = NAME;
  type Args = GetRoomEventArgs;
  type Output = GetRoomEventOutput;
  type Error = GetRoomEventError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Fetch any room-event row by its numeric id. Works for \
                    all event kinds: inline notes, chat bubbles, thinking \
                    rows, etc. The transcript marks events as `#N` (e.g. \
                    `(inline-note #42 by Author)` or `#42` in a compaction \
                    summary). Use this to retrieve content that has been \
                    compacted out of the live transcript. Lookups are scoped \
                    to this room."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "integer",
            "description": "Numeric id from the transcript or compaction summary."
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
        format!("Looked up event #{}", args.id),
        String::new(),
      )
      .await;

    let lookup = db::load_room_event(&self.state.db, args.id)
      .await
      .map_err(|e| GetRoomEventError::Load(e.to_string()));
    match lookup {
      Ok(Some(event)) if event.room_code == self.room_code => {
        row
          .replace_body(
            format!("Looked up event #{}", args.id),
            event.content.clone(),
          )
          .await;
        row.finish(true).await;
        Ok(GetRoomEventOutput {
          id: args.id,
          kind: event.kind.as_str().to_string(),
          agent: event.agent,
          content: event.content,
          detail: event.detail,
          timestamp: event.timestamp.to_rfc3339(),
        })
      }
      Ok(_) => {
        row
          .replace_body(
            format!("Failed to look up event #{}", args.id),
            format!("event #{} not found in this room", args.id),
          )
          .await;
        row.finish(false).await;
        Err(GetRoomEventError::NotFound(args.id))
      }
      Err(error) => {
        row
          .replace_body(
            format!("Failed to look up event #{}", args.id),
            error.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(error)
      }
    }
  }
}
