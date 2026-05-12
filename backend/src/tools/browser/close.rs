//! `browser_close` tool: reset the agent's tab to a blank page.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_close";

#[derive(Clone)]
pub struct BrowserCloseTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserCloseTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct CloseArgs {}

#[derive(Debug, Serialize)]
pub struct CloseOutput {
  pub ok: bool,
}

impl Tool for BrowserCloseTool {
  const NAME: &'static str = NAME;
  type Args = CloseArgs;
  type Output = CloseOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Reset the browser tab to a blank page, clearing the current page state."
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
        "Browser closing tab".to_string(),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      page
        .goto("about:blank")
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<CloseOutput, BrowserToolError>(CloseOutput { ok: true })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body("Browser tab closed".to_string(), String::new())
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser tab close failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
