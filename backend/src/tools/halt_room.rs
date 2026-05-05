//! `halt_room` tool: leader gate decision to pause a room when the debate
//! has converged. Persists a `leader_note` bubble carrying the reasoning
//! and flips the room into a paused state so the resume scheduler picks it
//! up at the next cron tick.

use crate::app_state::AppState;
use crate::db;
use crate::error::ReportError;
use crate::models::{RoomEvent, RoomEventKind, RoomStatus};
use crate::streaming::{WsEvent, new_turn_id};
use chrono::Utc;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;
use uuid::Uuid;

const NAME: &str = "halt_room";
pub const LEADER_HALT_AGENT: &str = "Leader (halt)";

#[derive(Clone)]
pub struct HaltRoomTool {
  state: AppState,
  room_id: Uuid,
  /// Cached schedule label so the default note stays meaningful when the
  /// model returns an empty `note`.
  schedule_label: String,
}

impl HaltRoomTool {
  pub fn new(state: AppState, room_id: Uuid, schedule_label: String) -> Self {
    Self {
      state,
      room_id,
      schedule_label,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct HaltRoomArgs {
  /// Reasoning shown as a public leader note bubble.
  pub note: String,
}

#[derive(Debug, Serialize)]
pub struct HaltRoomOutput {
  pub acknowledged: bool,
}

#[derive(Debug, Error)]
pub enum HaltRoomError {
  #[error("room handle missing")]
  HandleMissing,
  #[error("failed to update room status: {0}")]
  Persist(String),
}

impl Tool for HaltRoomTool {
  const NAME: &'static str = NAME;
  type Args = HaltRoomArgs;
  type Output = HaltRoomOutput;
  type Error = HaltRoomError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Pause the room until the next scheduled wake check. \
                    Call this when every persona has clearly run out of \
                    contributions and waiting is safe. Your `note` is \
                    persisted as a public leader bubble so the user sees \
                    why."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "note": {
            "type": "string",
            "description": "One or two sentences explaining why halting now is the right call."
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
        "All personas reported no further contribution. I approve pausing now. \
         I will re-check on schedule: {}.",
        self.schedule_label
      )
    } else {
      trimmed.to_string()
    };

    let handle = {
      let handles = self.state.room_handles.read().await;
      handles.get(&self.room_id).cloned()
    };
    let Some(handle) = handle else {
      return Err(HaltRoomError::HandleMissing);
    };

    let event = RoomEvent {
      room_id: self.room_id,
      sequence: handle.allocate_event_sequence(),
      kind: RoomEventKind::LeaderNote,
      agent: Some(LEADER_HALT_AGENT.to_string()),
      content: note,
      reasoning: String::new(),
      tool_calls: Vec::new(),
      timestamp: Utc::now(),
    };
    db::insert_event(&self.state.db, &event).await.report();

    let stream = self.state.ensure_room_stream(self.room_id).await;
    stream.send(WsEvent::MessageAdded {
      turn_id: new_turn_id(),
      message: event,
    });

    let updated_at = Utc::now();
    {
      let mut rooms = self.state.rooms.write().await;
      if let Some(room) = rooms.get_mut(&self.room_id) {
        room.status = RoomStatus::Paused;
        room.updated_at = updated_at;
      }
    }
    db::update_room_status(
      &self.state.db,
      self.room_id,
      RoomStatus::Paused,
      updated_at,
    )
    .await
    .map_err(|e| HaltRoomError::Persist(e.to_string()))?;

    handle.request_auto_pause();
    stream.send(WsEvent::RoomStatus {
      status: RoomStatus::Paused,
    });

    Ok(HaltRoomOutput { acknowledged: true })
  }
}
