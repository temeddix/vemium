//! `browser_navigate_back` tool: go back in the active tab's history.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use chromiumoxide::cdp::browser_protocol::page::{
  GetNavigationHistoryParams, NavigateToHistoryEntryParams,
};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

pub const NAME: &str = "browser_navigate_back";

#[derive(Clone)]
pub struct BrowserNavigateBackTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserNavigateBackTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct NavigateBackArgs {}

#[derive(Debug, Serialize)]
pub struct NavigateBackOutput {
  pub ok: bool,
  /// Whether there was history to go back to.
  pub navigated: bool,
}

impl Tool for BrowserNavigateBackTool {
  const NAME: &'static str = NAME;
  type Args = NavigateBackArgs;
  type Output = NavigateBackOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Go back one step in the active tab's browser history. \
                    Returns `navigated: false` if there is no previous page."
        .to_string(),
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
        "Browser navigating back".to_string(),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      let history = page
        .execute(GetNavigationHistoryParams::default())
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      let current_idx = history.current_index as usize;
      if current_idx == 0 || history.entries.is_empty() {
        return Ok::<NavigateBackOutput, BrowserToolError>(
          NavigateBackOutput {
            ok: true,
            navigated: false,
          },
        );
      }

      let entry_id = history.entries[current_idx - 1].id;
      page
        .execute(
          NavigateToHistoryEntryParams::builder()
            .entry_id(entry_id)
            .build()
            .map_err(|e| BrowserToolError::Cdp(e.to_string()))?,
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      // Wait for the page to finish loading. NavigateToHistoryEntry is
      // fire-and-forget in CDP so we must explicitly wait; a timeout guards
      // against the (rare) case where no navigation event fires.
      tokio::time::timeout(Duration::from_secs(10), page.wait_for_navigation())
        .await
        .map_err(|_| {
          BrowserToolError::Browser("navigate back timed out after 10s".into())
        })?
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      Ok::<NavigateBackOutput, BrowserToolError>(NavigateBackOutput {
        ok: true,
        navigated: true,
      })
    }
    .await;

    match result {
      Ok(output) => {
        let label = if output.navigated {
          "Browser navigated back"
        } else {
          "Browser: no history to go back"
        };
        row.replace_body(label.to_string(), String::new()).await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            "Browser navigate back failed".to_string(),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
