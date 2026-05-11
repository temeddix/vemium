//! `pause_room` tool: leader decision to pause the debate. Persists an
//! inline-note breadcrumb carrying the leader's reasoning in `detail` and
//! flips the room's [`DebateState`] to `Paused` so the resume scheduler
//! picks it up at the next cron tick.
//!
//! Note: this is the leader-controlled gate. The user-controlled
//! activate/deactivate path is independent and lives on the routes layer.

use crate::app_state::AppState;
use crate::db;
use crate::event_log::EventLog;
use crate::models::{DebateState, RoomEventKind};
use crate::streaming::WsEvent;
use chrono::Utc;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

pub const NAME: &str = "pause_room";
pub const INLINE_NOTE_TEXT: &str = "Paused debate";
pub const INLINE_NOTE_FAIL_TEXT: &str = "Failed to pause debate";
/// Stable agent label written to `room_events.agent` for leader rows.
pub const LEADER_AGENT: &str = "Leader";

#[derive(Clone)]
pub struct PauseRoomTool {
  state: AppState,
  room_code: String,
  schedule_label: String,
  log: EventLog,
}

impl PauseRoomTool {
  pub fn new(
    state: AppState,
    room_code: String,
    schedule_label: String,
    log: EventLog,
  ) -> Self {
    Self {
      state,
      room_code,
      schedule_label,
      log,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct PauseRoomArgs {
  /// Reasoning shown in the inline-note's click-to-reveal body.
  pub note: String,
}

#[derive(Debug, Serialize)]
pub struct PauseRoomOutput {
  pub acknowledged: bool,
}

#[derive(Debug, Error)]
pub enum PauseRoomError {
  #[error("room handle missing")]
  HandleMissing,
  #[error("failed to update debate state: {0}")]
  Persist(String),
}

impl Tool for PauseRoomTool {
  const NAME: &'static str = NAME;
  type Args = PauseRoomArgs;
  type Output = PauseRoomOutput;
  type Error = PauseRoomError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Pause the debate until the next scheduled wake check. \
                    Call this when the discussion has plainly run its \
                    course or further turns would be wasteful. Your `note` \
                    is recorded as the breadcrumb body so the user sees \
                    why if they click."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "note": {
            "type": "string",
            "description": "One or two sentences explaining why pausing now is the right call."
          }
        },
        "required": ["note"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let trimmed = args.note.trim();
    let note = if trimmed.is_empty() {
      format!(
        "Pausing the debate now. I will re-check on schedule: {}.",
        self.schedule_label
      )
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
      return Err(PauseRoomError::HandleMissing);
    };

    let updated_at = Utc::now();
    {
      let mut rooms = self.state.rooms.write().await;
      if let Some(room) = rooms.get_mut(&self.room_code) {
        room.debate_state = DebateState::Paused;
        room.updated_at = updated_at;
      }
    }
    if let Err(error) = db::update_debate_state(
      &self.state.db,
      &self.room_code,
      DebateState::Paused,
      updated_at,
    )
    .await
    {
      row
        .replace_body(INLINE_NOTE_FAIL_TEXT.to_string(), error.to_string())
        .await;
      row.finish(false).await;
      return Err(PauseRoomError::Persist(error.to_string()));
    }

    handle.request_pause_debate();
    let stream = self.state.ensure_room_stream(&self.room_code).await;
    stream.send(WsEvent::DebateState {
      state: DebateState::Paused,
    });

    row.finish(true).await;
    Ok(PauseRoomOutput { acknowledged: true })
  }
}
