//! `browser_handle_dialog` tool: accept or dismiss a JavaScript dialog.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use chromiumoxide::cdp::browser_protocol::page::HandleJavaScriptDialogParams;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_handle_dialog";

#[derive(Clone)]
pub struct BrowserHandleDialogTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserHandleDialogTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct HandleDialogArgs {
  pub accept: bool,
  pub prompt_text: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HandleDialogOutput {
  pub accepted: bool,
}

impl Tool for BrowserHandleDialogTool {
  const NAME: &'static str = NAME;
  type Args = HandleDialogArgs;
  type Output = HandleDialogOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description:
        "Accept or dismiss a JavaScript alert/confirm/prompt dialog."
          .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "accept": {
            "type": "boolean",
            "description": "true to accept/OK, false to dismiss/Cancel."
          },
          "prompt_text": {
            "type": "string",
            "description": "Text to enter when handling a prompt dialog."
          }
        },
        "required": ["accept"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Browser handling dialog (accept={})", args.accept),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let prompt_text = args.prompt_text.clone().unwrap_or_default();
      page
        .execute(
          HandleJavaScriptDialogParams::builder()
            .accept(args.accept)
            .prompt_text(prompt_text)
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      Ok::<HandleDialogOutput, BrowserToolError>(HandleDialogOutput {
        accepted: args.accept,
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser handled dialog (accepted={})", output.accepted),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            "Browser handle dialog failed".to_string(),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
