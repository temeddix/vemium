//! `resume_room` tool: leader gate decision to wake a paused debate at a
//! scheduled checkpoint. Persists an inline-note breadcrumb carrying the
//! note in `detail` and flips the room's [`DebateState`] back to `Running`.

use crate::app_state::AppState;
use crate::db;
use crate::event_log::EventLog;
use crate::models::{DebateState, RoomEventKind};
use crate::streaming::WsEvent;
use crate::tools::pause_room::LEADER_AGENT;
use chrono::Utc;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

pub const NAME: &str = "resume_room";
pub const INLINE_NOTE_TEXT: &str = "Resumed debate";
pub const INLINE_NOTE_FAIL_TEXT: &str = "Resume failed";

#[derive(Clone)]
pub struct ResumeRoomTool {
  state: AppState,
  room_code: String,
  log: EventLog,
}

impl ResumeRoomTool {
  pub fn new(state: AppState, room_code: String, log: EventLog) -> Self {
    Self {
      state,
      room_code,
      log,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct ResumeRoomArgs {
  /// Reasoning shown in the inline-note's click-to-reveal body.
  pub note: String,
}

#[derive(Debug, Serialize)]
pub struct ResumeRoomOutput {
  pub acknowledged: bool,
}

#[derive(Debug, Error)]
pub enum ResumeRoomError {
  #[error("room handle missing")]
  HandleMissing,
  #[error("failed to update debate state: {0}")]
  Persist(String),
}

impl Tool for ResumeRoomTool {
  const NAME: &'static str = NAME;
  type Args = ResumeRoomArgs;
  type Output = ResumeRoomOutput;
  type Error = ResumeRoomError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Wake the room and let the debate resume. Call this when \
                    a concrete next task should run now. Your `note` is \
                    recorded as the breadcrumb body announcing the restart."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "note": {
            "type": "string",
            "description": "One or two sentences explaining why resuming now is the right call."
          }
        },
        "required": ["note"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let trimmed = args.note.trim();
    let note = if trimmed.is_empty() {
      "Scheduled check approved restart. Resuming debate now.".to_string()
    } else {
      trimmed.to_string()
    };

    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(LEADER_AGENT.to_string()),
        INLINE_NOTE_TEXT.to_string(),
        note,
      )
      .await;

    let handle = {
      let handles = self.state.room_handles.read().await;
      handles.get(&self.room_code).cloned()
    };
    let Some(handle) = handle else {
      row
        .replace_body(
          INLINE_NOTE_FAIL_TEXT.to_string(),
          "room handle missing".to_string(),
        )
        .await;
      row.finish(false).await;
      return Err(ResumeRoomError::HandleMissing);
    };

    let updated_at = Utc::now();
    {
      let mut rooms = self.state.rooms.write().await;
      if let Some(room) = rooms.get_mut(&self.room_code) {
        room.debate_state = DebateState::Running;
        room.updated_at = updated_at;
      }
    }
    if let Err(error) = db::update_debate_state(
      &self.state.db,
      &self.room_code,
      DebateState::Running,
      updated_at,
    )
    .await
    {
      row
        .replace_body(INLINE_NOTE_FAIL_TEXT.to_string(), error.to_string())
        .await;
      row.finish(false).await;
      return Err(ResumeRoomError::Persist(error.to_string()));
    }

    handle.request_resume_debate();
    let stream = self.state.ensure_room_stream(&self.room_code).await;
    stream.send(WsEvent::DebateState {
      state: DebateState::Running,
    });

    row.finish(true).await;
    Ok(ResumeRoomOutput { acknowledged: true })
  }
}
