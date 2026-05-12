//! `browser_network_requests` tool: get resource timing entries for the active page.

use crate::browser::BrowserHandle;
use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::tools::browser::BrowserToolError;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub const NAME: &str = "browser_network_requests";

#[derive(Clone)]
pub struct BrowserNetworkRequestsTool {
  handle: BrowserHandle,
  log: EventLog,
  author: String,
}

impl BrowserNetworkRequestsTool {
  pub fn new(handle: BrowserHandle, log: EventLog, author: String) -> Self {
    Self {
      handle,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct NetworkRequestsArgs {}

#[derive(Debug, Serialize)]
pub struct NetworkEntry {
  pub url: String,
  /// Initiator type: `fetch`, `xmlhttprequest`, `script`, `img`, `css`, etc.
  pub kind: String,
  pub duration_ms: u64,
  pub transfer_size: u64,
}

#[derive(Debug, Serialize)]
pub struct NetworkRequestsOutput {
  pub requests: Vec<NetworkEntry>,
}

impl Tool for BrowserNetworkRequestsTool {
  const NAME: &'static str = NAME;
  type Args = NetworkRequestsArgs;
  type Output = NetworkRequestsOutput;
  type Error = BrowserToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description:
        "Return resource timing entries for the active tab. Each entry has \
         `url`, `kind` (fetch/xmlhttprequest/script/img/css/…), \
         `duration_ms`, and `transfer_size` (bytes, 0 when cached or \
         cross-origin). Does not include HTTP status codes."
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
        "Browser getting network requests".to_string(),
        String::new(),
      )
      .await;

    let result = async {
      let page = self
        .handle
        .active_page()
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;
      let raw: Value = page
        .evaluate(
          "() => JSON.stringify(performance.getEntriesByType('resource')\
           .map(e => ({\
             url: e.name,\
             kind: e.initiatorType,\
             duration_ms: Math.round(e.duration),\
             transfer_size: e.transferSize || 0\
           })))",
        )
        .await
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?
        .into_value()
        .map_err(|e| BrowserToolError::Browser(e.to_string()))?;

      let array_value = match raw {
        Value::String(s) => serde_json::from_str::<Value>(&s)
          .map_err(|e| BrowserToolError::Browser(e.to_string()))?,
        other => other,
      };

      let requests: Vec<NetworkEntry> = array_value
        .as_array()
        .map(|arr| {
          arr
            .iter()
            .filter_map(|item| {
              let url = item["url"].as_str()?.to_string();
              let kind = item["kind"].as_str().unwrap_or("other").to_string();
              let duration_ms = item["duration_ms"].as_u64().unwrap_or(0);
              let transfer_size = item["transfer_size"].as_u64().unwrap_or(0);
              Some(NetworkEntry {
                url,
                kind,
                duration_ms,
                transfer_size,
              })
            })
            .collect()
        })
        .unwrap_or_default();

      Ok::<NetworkRequestsOutput, BrowserToolError>(NetworkRequestsOutput {
        requests,
      })
    }
    .await;

    match result {
      Ok(output) => {
        row
          .replace_body(
            format!("Browser: {} network entries", output.requests.len()),
            String::new(),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(e) => {
        row
          .replace_body(
            "Browser network requests failed".to_string(),
            e.to_string(),
          )
          .await;
        row.finish(false).await;
        Err(e)
      }
    }
  }
}
