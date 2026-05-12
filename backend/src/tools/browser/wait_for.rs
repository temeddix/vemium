//! `browser_wait_for` tool: wait for a selector or a fixed time.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

pub const NAME: &str = "browser_wait_for";

#[derive(Clone)]
pub struct BrowserWaitForTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserWaitForTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct WaitForArgs {
  pub selector: Option<String>,
  pub time: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct WaitForOutput {
  pub ok: bool,
}

impl Tool for BrowserWaitForTool {
  const NAME: &'static str = NAME;
  type Args = WaitForArgs;
  type Output = WaitForOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Wait for a CSS selector to appear in the DOM, or sleep for a fixed number of seconds.".to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "selector": {
            "type": "string",
            "description": "CSS selector to wait for."
          },
          "time": {
            "type": "number",
            "description": "Seconds to wait (can be fractional)."
          }
        }
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let label = if let Some(sel) = &args.selector {
      format!("Browser waiting for selector: {sel}")
    } else if let Some(t) = args.time {
      format!("Browser waiting {t}s")
    } else {
      "Browser waiting".to_string()
    };

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
      if let Some(secs) = args.time {
        tokio::time::sleep(Duration::from_secs_f64(secs)).await;
      }
      if let Some(sel) = &args.selector {
        let page = self
          .handle
          .active_page()
          .await
          .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
        page
          .find_element(sel.as_str())
          .await
          .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      }
      Ok::<WaitForOutput, BrowserToolError>(WaitForOutput { ok: true })
    }
    .await;

    match result {
      Ok(output) => {
        row.replace_body(label, "done".to_string()).await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser wait failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
