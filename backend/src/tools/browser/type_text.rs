//! `browser_type` tool: type text into an element.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_type";

#[derive(Clone)]
pub struct BrowserTypeTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserTypeTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct TypeArgs {
  pub selector: String,
  pub text: String,
}

#[derive(Debug, Serialize)]
pub struct TypeOutput {
  pub selector: String,
}

impl Tool for BrowserTypeTool {
  const NAME: &'static str = NAME;
  type Args = TypeArgs;
  type Output = TypeOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description:
        "Type text into an input element identified by a CSS selector."
          .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "selector": { "type": "string", "description": "CSS selector of the input element." },
          "text": { "type": "string", "description": "Text to type." }
        },
        "required": ["selector", "text"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser typing into {}", args.selector),
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
        .type_str(args.text.as_str())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<TypeOutput, BrowserToolError>(TypeOutput {
        selector: args.selector.clone(),
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser typed into {}", args.selector),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            format!("Browser type failed: {}", args.selector),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
