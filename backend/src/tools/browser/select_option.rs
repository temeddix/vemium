//! `browser_select_option` tool: set a <select> element's value.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_select_option";

#[derive(Clone)]
pub struct BrowserSelectOptionTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserSelectOptionTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct SelectOptionArgs {
  pub selector: String,
  pub value: String,
}

#[derive(Debug, Serialize)]
pub struct SelectOptionOutput {
  pub selector: String,
  pub value: String,
}

impl Tool for BrowserSelectOptionTool {
  const NAME: &'static str = NAME;
  type Args = SelectOptionArgs;
  type Output = SelectOptionOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description:
        "Set the selected option on a <select> element and fire a change event."
          .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "selector": { "type": "string", "description": "CSS selector of the <select> element." },
          "value": { "type": "string", "description": "Option value to select." }
        },
        "required": ["selector", "value"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser selecting option in {}", args.selector),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let sel_json = serde_json::to_string(&args.selector)
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let val_json = serde_json::to_string(&args.value)
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let script = format!(
        "() => {{ const el = document.querySelector({sel}); \
         el.value = {val}; \
         el.dispatchEvent(new Event('change', {{bubbles:true}})); }}",
        sel = sel_json,
        val = val_json
      );
      page
        .evaluate(script)
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<SelectOptionOutput, BrowserToolError>(SelectOptionOutput {
        selector: args.selector.clone(),
        value: args.value.clone(),
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser selected '{}' in {}", args.value, args.selector),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            format!("Browser select option failed: {}", args.selector),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
