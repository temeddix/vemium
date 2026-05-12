//! `browser_drop` tool: simulate file drop onto an element via CDP.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use chromiumoxide::cdp::browser_protocol::dom::SetFileInputFilesParams;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_drop";

#[derive(Clone)]
pub struct BrowserDropTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserDropTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct DropArgs {
  pub selector: String,
  pub files: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DropOutput {
  pub selector: String,
  pub count: usize,
}

impl Tool for BrowserDropTool {
  const NAME: &'static str = NAME;
  type Args = DropArgs;
  type Output = DropOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Simulate dropping files onto a file input element (uses CDP DOM.setFileInputFiles).".to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "selector": {
            "type": "string",
            "description": "CSS selector of the file input element."
          },
          "files": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Absolute file paths to drop."
          }
        },
        "required": ["selector", "files"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let count = args.files.len();
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser dropping {count} file(s) onto {}", args.selector),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let element = page
        .find_element(args.selector.as_str())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      page
        .execute(
          SetFileInputFilesParams::builder()
            .files(args.files.clone())
            .backend_node_id(element.backend_node_id)
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<DropOutput, BrowserToolError>(DropOutput {
        selector: args.selector.clone(),
        count,
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser dropped {count} file(s) onto {}", args.selector),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser file drop failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
