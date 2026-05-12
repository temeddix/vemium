//! `browser_console_messages` tool: read console output captured by the
//! interceptor that was injected when the tab was created.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub const NAME: &str = "browser_console_messages";

#[derive(Clone)]
pub struct BrowserConsoleMessagesTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserConsoleMessagesTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct ConsoleMessagesArgs {}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConsoleEntry {
  pub level: String,
  pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ConsoleMessagesOutput {
  pub messages: Vec<ConsoleEntry>,
}

impl Tool for BrowserConsoleMessagesTool {
  const NAME: &'static str = NAME;
  type Args = ConsoleMessagesArgs;
  type Output = ConsoleMessagesOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Return console messages (log/info/warn/error/debug) captured \
                    on the active tab since the last navigation. Each entry has \
                    a `level` and `message` field."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {}
      }),
    }
  }

  async fn call(&self, _args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        "Browser reading console messages".to_string(),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let raw: Value = page
        .evaluate("() => window.__consoleLogs || []")
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?
        .into_value()
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let messages: Vec<ConsoleEntry> =
        serde_json::from_value(raw).unwrap_or_default();
      Ok::<ConsoleMessagesOutput, BrowserToolError>(ConsoleMessagesOutput {
        messages,
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser: {} console messages", output.messages.len()),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            "Browser console messages failed".to_string(),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
