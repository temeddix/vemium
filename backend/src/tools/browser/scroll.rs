//! `browser_scroll` tool: scroll the active page by a given offset.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_scroll";

#[derive(Clone)]
pub struct BrowserScrollTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserScrollTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct ScrollArgs {
  pub x: i64,
  pub y: i64,
}

#[derive(Debug, Serialize)]
pub struct ScrollOutput {
  pub ok: bool,
}

impl Tool for BrowserScrollTool {
  const NAME: &'static str = NAME;
  type Args = ScrollArgs;
  type Output = ScrollOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Scroll the active page by the given x and y pixel offsets."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "x": { "type": "integer", "description": "Horizontal scroll offset in pixels." },
          "y": { "type": "integer", "description": "Vertical scroll offset in pixels." }
        },
        "required": ["x", "y"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser scrolling ({}, {})", args.x, args.y),
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
        .evaluate(format!("() => window.scrollBy({}, {})", args.x, args.y))
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<ScrollOutput, BrowserToolError>(ScrollOutput { ok: true })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser scrolled ({}, {})", args.x, args.y),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser scroll failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
