//! `browser_take_screenshot` tool: capture a screenshot of the active page.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use crate::workspace::RoomWorkspace;
use base64::Engine;
use base64::prelude::BASE64_STANDARD;
use chromiumoxide::page::ScreenshotParams;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::Path;

pub const NAME: &str = "browser_take_screenshot";
const RAW_DIR: &str = "raw";

#[derive(Clone)]
pub struct BrowserTakeScreenshotTool {
  handle: BrowserHandle,
  workspace: RoomWorkspace,
  log: EventLog,
  author: String,
}

impl BrowserTakeScreenshotTool {
  pub fn new(
    handle: BrowserHandle,
    workspace: RoomWorkspace,
    log: EventLog,
    author: String,
  ) -> Self {
    Self {
      handle,
      workspace,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct TakeScreenshotArgs {
  pub full_page: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct TakeScreenshotOutput {
  pub path: String,
  pub base64: String,
}

impl Tool for BrowserTakeScreenshotTool {
  const NAME: &'static str = NAME;
  type Args = TakeScreenshotArgs;
  type Output = TakeScreenshotOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Take a screenshot of the active browser tab. \
                    Saves the PNG to the workspace and returns the path and base64 content."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "full_page": {
            "type": "boolean",
            "description": "Capture the full scrollable page (default false)."
          }
        }
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        "Taking browser screenshot".to_string(),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let full_page = args.full_page.unwrap_or(false);
      let bytes = page
        .screenshot(ScreenshotParams::builder().full_page(full_page).build())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      let timestamp = chrono::Utc::now().timestamp();
      let relative = format!("{RAW_DIR}/screenshot-{timestamp}.png");
      self
        .workspace
        .write_file_bytes(Path::new(&relative), &bytes)
        .await
        .map_err(|e| BrowserToolError::Workspace(e.to_string()))?;

      let encoded = BASE64_STANDARD.encode(&bytes);
      Ok::<TakeScreenshotOutput, BrowserToolError>(TakeScreenshotOutput {
        path: relative,
        base64: encoded,
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            "Browser screenshot saved".to_string(),
            format!("path: {}", output.path),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser screenshot failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
