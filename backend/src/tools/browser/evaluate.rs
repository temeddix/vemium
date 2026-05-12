//! `browser_evaluate` tool: run a JS expression in the active tab.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub const NAME: &str = "browser_evaluate";

#[derive(Clone)]
pub struct BrowserEvaluateTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserEvaluateTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct EvaluateArgs {
  pub function: String,
}

#[derive(Debug, Serialize)]
pub struct EvaluateOutput {
  pub result: String,
}

impl Tool for BrowserEvaluateTool {
  const NAME: &'static str = NAME;
  type Args = EvaluateArgs;
  type Output = EvaluateOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Evaluate a JavaScript arrow function in the active tab and return its result as JSON.".to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "function": {
            "type": "string",
            "description": "JS arrow function to evaluate, e.g. '() => document.title'."
          }
        },
        "required": ["function"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        "Browser evaluating JS".to_string(),
        args.function.clone(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let value: Value = page
        .evaluate(args.function.as_str())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?
        .into_value()
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let result_str = serde_json::to_string(&value)
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<EvaluateOutput, BrowserToolError>(EvaluateOutput {
        result: result_str,
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body("Browser evaluated JS".to_string(), output.result.clone())
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser evaluate JS failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
