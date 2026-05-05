//! `resume_room` tool: leader gate decision to wake a paused debate at a
//! scheduled checkpoint. Persists a `leader_note` bubble announcing the
//! restart and flips the room's [`DebateState`] back to `Running`.
//!
//! Note: this is the leader-controlled gate. The user-controlled
//! activate/deactivate path is independent and lives on the routes layer.

use crate::app_state::AppState;
use crate::db;
use crate::error::ReportError;
use crate::models::{DebateState, RoomEvent, RoomEventKind};
use crate::streaming::{WsEvent, new_turn_id};
use crate::tools::pause_room::LEADER_AGENT;
use chrono::Utc;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

const NAME: &str = "resume_room";

#[derive(Clone)]
pub struct ResumeRoomTool {
  state: AppState,
  room_code: String,
}

impl ResumeRoomTool {
  pub fn new(state: AppState, room_code: String) -> Self {
    Self { state, room_code }
  }
}

#[derive(Debug, Deserialize)]
pub struct ResumeRoomArgs {
  /// Reasoning shown as a public leader note bubble.
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
      handles.get(&self.room_code).cloned()
    };
    let Some(handle) = handle else {
      return Err(ResumeRoomError::HandleMissing);
    };

    let draft = RoomEvent {
      id: None,
      room_code: self.room_code.clone(),
      sequence: handle.allocate_event_sequence(),
      kind: RoomEventKind::LeaderNote,
      agent: Some(LEADER_AGENT.to_string()),
      content: note,
      reasoning: String::new(),
      detail: String::new(),
      tool_calls: Vec::new(),
      timestamp: Utc::now(),
    };
    let event = db::insert_event(&self.state.db, &draft)
      .await
      .report()
      .unwrap_or_else(|| draft.clone());

    let stream = self.state.ensure_room_stream(&self.room_code).await;
    stream.send(WsEvent::MessageAdded {
      turn_id: new_turn_id(),
      message: event,
    });

    let updated_at = Utc::now();
    {
      let mut rooms = self.state.rooms.write().await;
      if let Some(room) = rooms.get_mut(&self.room_code) {
        room.debate_state = DebateState::Running;
        room.updated_at = updated_at;
      }
    }
    db::update_debate_state(
      &self.state.db,
      &self.room_code,
      DebateState::Running,
      updated_at,
    )
    .await
    .map_err(|e| ResumeRoomError::Persist(e.to_string()))?;

    handle.request_resume_debate();
    stream.send(WsEvent::DebateState {
      state: DebateState::Running,
    });

    Ok(ResumeRoomOutput { acknowledged: true })
  }
}
