//! `browser_fill_form` tool: fill multiple form fields in one call.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_fill_form";

#[derive(Clone)]
pub struct BrowserFillFormTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserFillFormTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct FormField {
  pub selector: String,
  pub value: String,
}

#[derive(Debug, Deserialize)]
pub struct FillFormArgs {
  pub fields: Vec<FormField>,
}

#[derive(Debug, Serialize)]
pub struct FillFormOutput {
  pub filled: usize,
}

impl Tool for BrowserFillFormTool {
  const NAME: &'static str = NAME;
  type Args = FillFormArgs;
  type Output = FillFormOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Fill multiple form input fields in a single call."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "fields": {
            "type": "array",
            "items": {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "selector": { "type": "string" },
                "value": { "type": "string" }
              },
              "required": ["selector", "value"]
            },
            "description": "List of selector+value pairs to fill."
          }
        },
        "required": ["fields"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser filling {} form fields", args.fields.len()),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      for field in &args.fields {
        page
          .find_element(field.selector.as_str())
          .await
          .map_err(|e| BrowserToolError::Browser(e.to_string()))?
          .type_str(field.value.as_str())
          .await
          .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      }
      Ok::<FillFormOutput, BrowserToolError>(FillFormOutput {
        filled: args.fields.len(),
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser filled {} fields", output.filled),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser form fill failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
