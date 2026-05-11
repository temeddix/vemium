//! `web_fetch` tool: renders a URL through the Playwright sidecar, takes
//! the resulting HTML, and converts it to Markdown via [`kreuzberg`].
//!
//! Pipeline:
//!
//! 1. `browser_navigate(url)` over the shared MCP connection (real Chrome,
//!    so JavaScript-rendered pages and SPAs work).
//! 2. `browser_wait_for({"time": POST_NAVIGATE_WAIT_SECS})` so that SPA
//!    frameworks have a chance to fetch their data and render — `navigate`
//!    only blocks until the `load` event, which fires on an empty shell
//!    for client-rendered apps. A fixed wait is a deliberate trade-off
//!    against per-page tuning: simpler than a `networkidle` heuristic and
//!    covers ~all real-world SPAs.
//! 3. `browser_evaluate(() => document.documentElement.outerHTML)` to
//!    capture the page after JS has settled.
//! 4. [`kreuzberg::extract_bytes`] with `text/html` MIME hint.
//! 5. Save the full markdown to `raw/<url-hash>.md`. Small results are
//!    inlined in the response; larger results return only the path plus a
//!    preview, leaving the agent to read selectively via `workspace`.
//!
//! No content extraction / readability is applied: agents that are
//! exploring a page (e.g. looking for a download button) need to see the
//! whole page, not a Reader-View-stripped version. Token blow-up is
//! mitigated by the file-on-disk + small-inline pattern, not by lossy
//! filtering.
//!
//! When the MCP connection is unavailable (`McpHandle == None`), the tool
//! returns a structured error rather than panicking, so the agent can
//! degrade gracefully.

use std::path::Path;
use std::sync::Arc;

use crate::event_log::EventLog;
use crate::mcp_client::McpHandle;
use crate::models::RoomEventKind;
use crate::workspace::RoomWorkspace;
use kreuzberg::{ExtractionConfig, extract_bytes};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use rmcp::model::{CallToolResult, Content, RawContent};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const NAME: &str = "web_fetch";
pub const INLINE_NOTE_OK: &str = "Fetched URL";
pub const INLINE_NOTE_FAIL: &str = "Failed to fetch URL";

const RAW_DIR: &str = "raw";
/// Char count above which the body is omitted from the tool result and
/// the agent must read the saved file.
const INLINE_THRESHOLD_CHARS: usize = 12_000;
const PREVIEW_CHARS: usize = 2_000;
/// Seconds to wait between `browser_navigate` and `browser_evaluate` so
/// SPA frameworks can fetch data and render. Tuned to cover the common
/// case (React/Vue/Lit apps fetching one or two XHRs after `load`)
/// without dragging on simple static pages.
const POST_NAVIGATE_WAIT_SECS: f64 = 2.0;

const HTML_DUMP_SCRIPT: &str = "() => document.documentElement.outerHTML";

#[derive(Clone)]
pub struct WebFetchTool {
  workspace: RoomWorkspace,
  mcp: Arc<McpHandle>,
  log: EventLog,
  author: String,
}

impl WebFetchTool {
  pub fn new(
    workspace: RoomWorkspace,
    mcp: McpHandle,
    log: EventLog,
    author: String,
  ) -> Self {
    Self {
      workspace,
      mcp: Arc::new(mcp),
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct WebFetchArgs {
  pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebFetchOutput {
  pub url: String,
  /// Workspace-relative path of the saved Markdown file (always written).
  pub path: String,
  pub total_chars: usize,
  /// Inline body when small enough; `None` when above the threshold.
  pub markdown: Option<String>,
}

#[derive(Debug, Error)]
pub enum WebFetchError {
  #[error("MCP call failed: {0}")]
  Mcp(String),
  #[error("Playwright returned no HTML for {0}")]
  NoHtml(String),
  #[error("kreuzberg failed: {0}")]
  Kreuzberg(String),
  #[error("workspace error: {0}")]
  Workspace(String),
}

impl Tool for WebFetchTool {
  const NAME: &'static str = NAME;
  type Args = WebFetchArgs;
  type Output = WebFetchOutput;
  type Error = WebFetchError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Fetches an HTML page through a real browser \
                    (JavaScript and SPAs work) and returns it as Markdown. \
                    Full content is always saved to `raw/<url-hash>.md`. \
                    Small pages also return the body inline; large pages \
                    return only the path and a preview that you read or \
                    grep through the workspace tools."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "url": {
            "type": "string",
            "description": "Absolute http(s) URL to fetch."
          }
        },
        "required": ["url"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Fetching {}", args.url),
        String::new(),
      )
      .await;

    let result = self.fetch(&args.url).await;
    match result {
      Ok(output) => {
        let preview = match &output.markdown {
          Some(body) => truncate(body, PREVIEW_CHARS),
          None => "(body too large to inline; read the saved file)".to_string(),
        };
        row
          .replace_body(
            INLINE_NOTE_OK.to_string(),
            format!(
              "{} -> {} ({} chars)\n\n{preview}",
              args.url, output.path, output.total_chars
            ),
          )
          .await;
        row.finish(true).await;
        Ok(output)
      }
      Err(error) => {
        row
          .replace_body(
            INLINE_NOTE_FAIL.to_string(),
            format!("{}\n\n{error}", args.url),
          )
          .await;
        row.finish(false).await;
        Err(error)
      }
    }
  }
}

impl WebFetchTool {
  async fn fetch(&self, url: &str) -> Result<WebFetchOutput, WebFetchError> {
    self
      .mcp
      .call_tool("browser_navigate", json!({ "url": url }))
      .await
      .map_err(|e| WebFetchError::Mcp(e.to_string()))?;

    self
      .mcp
      .call_tool(
        "browser_wait_for",
        json!({ "time": POST_NAVIGATE_WAIT_SECS }),
      )
      .await
      .map_err(|e| WebFetchError::Mcp(e.to_string()))?;

    let evaluate = self
      .mcp
      .call_tool("browser_evaluate", json!({ "function": HTML_DUMP_SCRIPT }))
      .await
      .map_err(|e| WebFetchError::Mcp(e.to_string()))?;

    let html = extract_html(&evaluate)
      .ok_or_else(|| WebFetchError::NoHtml(url.to_string()))?;

    let config = ExtractionConfig::default();
    let result = extract_bytes(html.as_bytes(), "text/html", &config)
      .await
      .map_err(|e| WebFetchError::Kreuzberg(e.to_string()))?;
    let markdown = result.content;
    let total_chars = markdown.chars().count();

    let target_relative = format!("{RAW_DIR}/{}.md", url_hash(url));
    self
      .workspace
      .write_file(Path::new(&target_relative), &markdown)
      .await
      .map_err(|e| WebFetchError::Workspace(e.to_string()))?;

    let inline = if total_chars <= INLINE_THRESHOLD_CHARS {
      Some(markdown)
    } else {
      None
    };

    Ok(WebFetchOutput {
      url: url.to_string(),
      path: target_relative,
      total_chars,
      markdown: inline,
    })
  }
}

/// Pulls the HTML string out of a `browser_evaluate` MCP result.
/// playwright-mcp delivers the evaluate return value as one or more
/// `RawContent::Text` chunks; non-text variants (resource refs, image
/// blobs) are not produced for `browser_evaluate` and are ignored if
/// they ever appear. When the JS return value is a primitive string,
/// the chunk content is JSON-encoded with surrounding quotes, so we
/// concatenate the text chunks, unwrap the outer JSON-string layer
/// when it parses, and otherwise hand the raw buffer to kreuzberg.
fn extract_html(result: &CallToolResult) -> Option<String> {
  let mut buffer = String::new();
  for content in result.content.iter() {
    if let Some(text) = content_text(content) {
      buffer.push_str(text);
    }
  }
  let trimmed = buffer.trim();
  if trimmed.is_empty() {
    return None;
  }
  // Playwright wraps the evaluate return in JSON quotes when it's a
  // primitive string. If the buffer parses as a JSON string, unwrap it.
  if let Ok(Value::String(inner)) = serde_json::from_str::<Value>(trimmed)
    && !inner.is_empty()
  {
    return Some(inner);
  }
  Some(buffer)
}

fn content_text(content: &Content) -> Option<&str> {
  match &content.raw {
    RawContent::Text(text) => Some(text.text.as_str()),
    _ => None,
  }
}

fn url_hash(url: &str) -> String {
  let digest = Sha256::digest(url.as_bytes());
  digest.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

fn truncate(text: &str, max_chars: usize) -> String {
  if text.chars().count() <= max_chars {
    return text.to_string();
  }
  let mut out: String = text.chars().take(max_chars).collect();
  out.push_str("\n\n... (preview truncated)");
  out
}
