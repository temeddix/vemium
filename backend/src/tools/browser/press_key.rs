//! `browser_press_key` tool: dispatch a key event on the active page.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use chromiumoxide::cdp::browser_protocol::input::{
  DispatchKeyEventParams, DispatchKeyEventType,
};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_press_key";

#[derive(Clone)]
pub struct BrowserPressKeyTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserPressKeyTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct PressKeyArgs {
  pub key: String,
}

#[derive(Debug, Serialize)]
pub struct PressKeyOutput {
  pub key: String,
}

impl Tool for BrowserPressKeyTool {
  const NAME: &'static str = NAME;
  type Args = PressKeyArgs;
  type Output = PressKeyOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description:
        "Press a keyboard key on the active page (e.g. Enter, Tab, Escape)."
          .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "key": { "type": "string", "description": "Key name (e.g. 'Enter', 'Tab', 'Escape', 'ArrowDown')." }
        },
        "required": ["key"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser pressing key: {}", args.key),
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
          DispatchKeyEventParams::builder()
            .r#type(DispatchKeyEventType::KeyDown)
            .key(args.key.clone())
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      page
        .execute(
          DispatchKeyEventParams::builder()
            .r#type(DispatchKeyEventType::KeyUp)
            .key(args.key.clone())
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<PressKeyOutput, BrowserToolError>(PressKeyOutput {
        key: args.key.clone(),
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser pressed key: {}", args.key),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            format!("Browser key press failed: {}", args.key),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
