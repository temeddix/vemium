//! `browser_hover` tool: move the mouse to an element.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use chromiumoxide::cdp::browser_protocol::input::{
  DispatchMouseEventParams, DispatchMouseEventType,
};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_hover";

#[derive(Clone)]
pub struct BrowserHoverTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserHoverTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct HoverArgs {
  pub selector: String,
}

#[derive(Debug, Serialize)]
pub struct HoverOutput {
  pub selector: String,
}

impl Tool for BrowserHoverTool {
  const NAME: &'static str = NAME;
  type Args = HoverArgs;
  type Output = HoverOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description:
        "Move the mouse over an element identified by a CSS selector."
          .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "selector": {
            "type": "string",
            "description": "CSS selector of the element to hover over."
          }
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
        format!("Browser hovering over {}", args.selector),
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
      let bbox = element
        .bounding_box()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      page
        .execute(
          DispatchMouseEventParams::builder()
            .r#type(DispatchMouseEventType::MouseMoved)
            .x(bbox.x + bbox.width / 2.0)
            .y(bbox.y + bbox.height / 2.0)
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<HoverOutput, BrowserToolError>(HoverOutput {
        selector: args.selector.clone(),
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser hovered over {}", args.selector),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            format!("Browser hover failed: {}", args.selector),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
