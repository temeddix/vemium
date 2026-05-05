//! `pause_room` tool: leader gate decision to pause the debate when it has
//! converged. Persists a `leader_note` bubble carrying the reasoning and
//! flips the room's [`DebateState`] to `Paused` so the resume scheduler
//! picks it up at the next cron tick.
//!
//! Note: this is the leader-controlled gate. The user-controlled
//! activate/deactivate path is independent and lives on the routes layer.

use crate::app_state::AppState;
use crate::db;
use crate::error::ReportError;
use crate::models::{DebateState, RoomEvent, RoomEventKind};
use crate::streaming::{WsEvent, new_turn_id};
use chrono::Utc;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;

const NAME: &str = "pause_room";
/// Stable agent label written to `room_events.agent`. Always plain
/// "Leader"; the gate context (steering / on-demand / pause / resume) is
/// surfaced via a preceding inline note rather than baked into the name.
pub const LEADER_AGENT: &str = "Leader";

#[derive(Clone)]
pub struct PauseRoomTool {
  state: AppState,
  room_code: String,
  /// Cached schedule label so the default note stays meaningful when the
  /// model returns an empty `note`.
  schedule_label: String,
}

impl PauseRoomTool {
  pub fn new(
    state: AppState,
    room_code: String,
    schedule_label: String,
  ) -> Self {
    Self {
      state,
      room_code,
      schedule_label,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct PauseRoomArgs {
  /// Reasoning shown as a public leader note bubble.
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
        "All personas reported no further contribution. I approve pausing now. \
         I will re-check on schedule: {}.",
        self.schedule_label
      )
    } else {
      trimmed.to_string()
    };

    let handle = {
      let handles = self.state.room_handles.read().await;
      handles.get(&self.room_code).cloned()
    };
    let Some(handle) = handle else {
      return Err(PauseRoomError::HandleMissing);
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
        room.debate_state = DebateState::Paused;
        room.updated_at = updated_at;
      }
    }
    db::update_debate_state(
      &self.state.db,
      &self.room_code,
      DebateState::Paused,
      updated_at,
    )
    .await
    .map_err(|e| PauseRoomError::Persist(e.to_string()))?;

    handle.request_auto_pause();
    stream.send(WsEvent::DebateState {
      state: DebateState::Paused,
    });

    Ok(PauseRoomOutput { acknowledged: true })
  }
}
