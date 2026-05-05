//! `proceed_room` tool: leader gate decision to wake a paused room at a
//! scheduled checkpoint. Persists a `leader_note` bubble announcing the
//! restart and flips the room back to active.

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

const NAME: &str = "proceed_room";
pub const LEADER_PROCEED_AGENT: &str = "Leader (proceed)";

#[derive(Clone)]
pub struct ProceedRoomTool {
  state: AppState,
  room_id: Uuid,
}

impl ProceedRoomTool {
  pub fn new(state: AppState, room_id: Uuid) -> Self {
    Self { state, room_id }
  }
}

#[derive(Debug, Deserialize)]
pub struct ProceedRoomArgs {
  /// Reasoning shown as a public leader note bubble.
  pub note: String,
}

#[derive(Debug, Serialize)]
pub struct ProceedRoomOutput {
  pub acknowledged: bool,
}

#[derive(Debug, Error)]
pub enum ProceedRoomError {
  #[error("room handle missing")]
  HandleMissing,
  #[error("failed to update room status: {0}")]
  Persist(String),
}

impl Tool for ProceedRoomTool {
  const NAME: &'static str = NAME;
  type Args = ProceedRoomArgs;
  type Output = ProceedRoomOutput;
  type Error = ProceedRoomError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Wake the room and let the debate resume. Call this when \
                    a concrete next task should run now. Your `note` is \
                    persisted as a public leader bubble announcing the \
                    restart."
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

    let handle = {
      let handles = self.state.room_handles.read().await;
      handles.get(&self.room_id).cloned()
    };
    let Some(handle) = handle else {
      return Err(ProceedRoomError::HandleMissing);
    };

    let event = RoomEvent {
      room_id: self.room_id,
      sequence: handle.allocate_event_sequence(),
      kind: RoomEventKind::LeaderNote,
      agent: Some(LEADER_PROCEED_AGENT.to_string()),
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
        room.status = RoomStatus::Active;
        room.updated_at = updated_at;
      }
    }
    db::update_room_status(
      &self.state.db,
      self.room_id,
      RoomStatus::Active,
      updated_at,
    )
    .await
    .map_err(|e| ProceedRoomError::Persist(e.to_string()))?;

    handle.request_resume();
    stream.send(WsEvent::RoomStatus {
      status: RoomStatus::Active,
    });

    Ok(ProceedRoomOutput { acknowledged: true })
  }
}
