//! `browser_navigate` tool: navigate the active tab to a URL.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_navigate";

#[derive(Clone)]
pub struct BrowserNavigateTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserNavigateTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct NavigateArgs {
  pub url: String,
}

#[derive(Debug, Serialize)]
pub struct NavigateOutput {
  pub url: String,
  pub title: String,
}

impl Tool for BrowserNavigateTool {
  const NAME: &'static str = NAME;
  type Args = NavigateArgs;
  type Output = NavigateOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Navigate the active browser tab to a URL. \
                    Waits for the page load event before returning."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "url": { "type": "string", "description": "Absolute http(s) URL." }
        },
        "required": ["url"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser navigating to {}", args.url),
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
        .goto(args.url.as_str())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let title = page
        .get_title()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?
        .unwrap_or_default();
      Ok::<NavigateOutput, BrowserToolError>(NavigateOutput {
        url: args.url.clone(),
        title,
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser navigated to {}", args.url),
            format!("title: {}", output.title),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            format!("Browser navigation failed: {}", args.url),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
