//! `browser_resize` tool: resize the active tab's viewport.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use chromiumoxide::cdp::browser_protocol::emulation::SetDeviceMetricsOverrideParams;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_resize";

#[derive(Clone)]
pub struct BrowserResizeTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserResizeTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct ResizeArgs {
  pub width: u32,
  pub height: u32,
}

#[derive(Debug, Serialize)]
pub struct ResizeOutput {
  pub width: u32,
  pub height: u32,
}

impl Tool for BrowserResizeTool {
  const NAME: &'static str = NAME;
  type Args = ResizeArgs;
  type Output = ResizeOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Resize the active tab's viewport to the given dimensions."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "width": { "type": "integer", "description": "Viewport width in pixels." },
          "height": { "type": "integer", "description": "Viewport height in pixels." }
        },
        "required": ["width", "height"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser resizing viewport to {}x{}", args.width, args.height),
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
        .execute(
          SetDeviceMetricsOverrideParams::builder()
            .width(args.width as i64)
            .height(args.height as i64)
            .device_scale_factor(1.0)
            .mobile(false)
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<ResizeOutput, BrowserToolError>(ResizeOutput {
        width: args.width,
        height: args.height,
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser resized to {}x{}", args.width, args.height),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser resize failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
