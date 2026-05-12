//! `browser_click` tool: click an element by CSS selector.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_click";

#[derive(Clone)]
pub struct BrowserClickTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserClickTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct ClickArgs {
  pub selector: String,
}

#[derive(Debug, Serialize)]
pub struct ClickOutput {
  pub selector: String,
}

impl Tool for BrowserClickTool {
  const NAME: &'static str = NAME;
  type Args = ClickArgs;
  type Output = ClickOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description:
        "Click an element on the active page identified by a CSS selector."
          .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "selector": { "type": "string", "description": "CSS selector of the element to click." }
        },
        "required": ["selector"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser clicking {}", args.selector),
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
        .find_element(args.selector.as_str())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?
        .click()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<ClickOutput, BrowserToolError>(ClickOutput {
        selector: args.selector.clone(),
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser clicked {}", args.selector),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            format!("Browser click failed: {}", args.selector),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
