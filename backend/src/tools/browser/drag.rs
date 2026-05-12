//! `browser_drag` tool: drag from one element to another.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use chromiumoxide::cdp::browser_protocol::input::{
  DispatchMouseEventParams, DispatchMouseEventType, MouseButton,
};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_drag";

#[derive(Clone)]
pub struct BrowserDragTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserDragTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct DragArgs {
  pub start_selector: String,
  pub end_selector: String,
}

#[derive(Debug, Serialize)]
pub struct DragOutput {
  pub ok: bool,
}

impl Tool for BrowserDragTool {
  const NAME: &'static str = NAME;
  type Args = DragArgs;
  type Output = DragOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Drag from one element to another using mouse events."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "start_selector": {
            "type": "string",
            "description": "CSS selector of the element to drag from."
          },
          "end_selector": {
            "type": "string",
            "description": "CSS selector of the element to drag to."
          }
        },
        "required": ["start_selector", "end_selector"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let label = format!(
      "Browser dragging {} -> {}",
      args.start_selector, args.end_selector
    );
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        label.clone(),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      let start_bbox = page
        .find_element(args.start_selector.as_str())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?
        .bounding_box()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      let end_bbox = page
        .find_element(args.end_selector.as_str())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?
        .bounding_box()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      let sx = start_bbox.x + start_bbox.width / 2.0;
      let sy = start_bbox.y + start_bbox.height / 2.0;
      let ex = end_bbox.x + end_bbox.width / 2.0;
      let ey = end_bbox.y + end_bbox.height / 2.0;

      // mousedown at start
      page
        .execute(
          DispatchMouseEventParams::builder()
            .r#type(DispatchMouseEventType::MousePressed)
            .x(sx)
            .y(sy)
            .button(MouseButton::Left)
            .click_count(1)
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      // mousemove to end
      page
        .execute(
          DispatchMouseEventParams::builder()
            .r#type(DispatchMouseEventType::MouseMoved)
            .x(ex)
            .y(ey)
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      // mouseup at end
      page
        .execute(
          DispatchMouseEventParams::builder()
            .r#type(DispatchMouseEventType::MouseReleased)
            .x(ex)
            .y(ey)
            .button(MouseButton::Left)
            .click_count(1)
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      Ok::<DragOutput, BrowserToolError>(DragOutput { ok: true })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(label.replacen("Browser dragging", "Browser dragged", 1), String::new())
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser drag failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
