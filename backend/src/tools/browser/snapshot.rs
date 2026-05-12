//! `browser_snapshot` tool: get the accessibility tree of the active page.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use chromiumoxide::cdp::browser_protocol::accessibility::GetFullAxTreeParams;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;

pub const NAME: &str = "browser_snapshot";

#[derive(Clone)]
pub struct BrowserSnapshotTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserSnapshotTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct SnapshotArgs {}

#[derive(Debug, Serialize)]
pub struct SnapshotOutput {
  pub snapshot: String,
}

impl Tool for BrowserSnapshotTool {
  const NAME: &'static str = NAME;
  type Args = SnapshotArgs;
  type Output = SnapshotOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Get the accessibility tree (AX snapshot) of the active browser tab as indented text.".to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {}
      }),
    }
  }

  async fn call(&self, _args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        "Browser getting AX snapshot".to_string(),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let resp = page
        .execute(GetFullAxTreeParams::default())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let mut lines = Vec::new();
      for node in &resp.result.nodes {
        let role = node
          .role
          .as_ref()
          .and_then(|v| v.value.as_ref())
          .and_then(|v| v.as_str())
          .unwrap_or("unknown");
        let name = node
          .name
          .as_ref()
          .and_then(|v| v.value.as_ref())
          .and_then(|v| v.as_str())
          .map(|s| format!(" \"{s}\""))
          .unwrap_or_default();
        lines.push(format!("{role}{name}"));
      }
      Ok::<SnapshotOutput, BrowserToolError>(SnapshotOutput {
        snapshot: lines.join("\n"),
      })
    }
    .await;

    match result {
      Ok(output) => {
        let preview: String = output
          .snapshot
          .lines()
          .take(5)
          .collect::<Vec<_>>()
          .join("\n");
        row
          .replace_body("Browser got AX snapshot".to_string(), preview)
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body("Browser AX snapshot failed".to_string(), e.to_string())
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
