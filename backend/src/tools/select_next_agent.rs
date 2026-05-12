//! `select_next_agent` tool: lets a debater nominate who speaks next.
//!
//! This tool is intentionally silent — it produces no inline-note row and
//! no visible breadcrumb. The selected name is stored in a shared slot that
//! [`crate::runtime`] reads after the turn to route the next debate turn.
//! When "Leader" is selected the runtime runs a leader decision turn instead
//! of advancing to another debater. If the agent does not call this tool the
//! runtime gives the floor back to the same agent (up to a retry limit).

use std::sync::Arc;

use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use thiserror::Error;
use tokio::sync::Mutex;

pub const NAME: &str = "select_next_agent";

/// Shared slot written by the tool and read by the runtime after each turn.
pub type NextAgentSlot = Arc<Mutex<Option<String>>>;

#[derive(Clone)]
pub struct SelectNextAgentTool {
  slot: NextAgentSlot,
}

impl SelectNextAgentTool {
  pub fn new(slot: NextAgentSlot) -> Self {
    Self { slot }
  }
}

#[derive(Debug, Deserialize)]
pub struct SelectNextAgentArgs {
  pub next_agent: String,
}

#[derive(Debug, Serialize)]
pub struct SelectNextAgentOutput {
  pub acknowledged: bool,
}

#[derive(Debug, Error)]
pub enum SelectNextAgentError {}

impl Tool for SelectNextAgentTool {
  const NAME: &'static str = NAME;
  type Args = SelectNextAgentArgs;
  type Output = SelectNextAgentOutput;
  type Error = SelectNextAgentError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "You MUST call this at the end of every turn to nominate \
                    who speaks next. Choose a debater \
                    (Researcher / Strategist / Skeptic / Moderator) for \
                    normal follow-up, or Leader to escalate to the room \
                    leader for a verdict. Omitting this call gives the floor \
                    back to you. This call produces no visible output."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "next_agent": {
            "type": "string",
            "description": "Name of the agent to speak next.",
            "enum": ["Researcher", "Strategist", "Skeptic", "Moderator", "Leader"]
          }
        },
        "required": ["next_agent"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    *self.slot.lock().await = Some(args.next_agent);
    Ok(SelectNextAgentOutput { acknowledged: true })
  }
}
