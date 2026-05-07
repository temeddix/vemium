//! `web_fetch` tool: fetch a URL via crawl4ai and return its content as
//! Markdown.
//!
//! Uses the crawl4ai `/md` endpoint which renders JavaScript, strips noise,
//! and returns clean Markdown in a single synchronous request.

use crate::event_log::EventLog;
use crate::models::{RoomEventKind, RowStatus};
use reqwest::Client;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;
use thiserror::Error;

pub const NAME: &str = "web_fetch";
pub const INLINE_NOTE_TEXT: &str = "Fetched URL";
pub const INLINE_NOTE_FAIL_TEXT: &str = "Web fetch failed";
/// Markdown preview cap for the inline-note `detail`.
const NOTE_PREVIEW_CHARS: usize = 2_000;
const DEFAULT_MAX_CHARS: usize = 12_000;
const MIN_MAX_CHARS: usize = 256;
const CRAWL4AI_URL: &str = "http://crawl4ai:11235";
/// crawl4ai may need time to render JS-heavy pages.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// Owns the shared `reqwest::Client`. Cheap to clone.
#[derive(Clone)]
pub struct WebFetchTool {
  http: Client,
  log: EventLog,
  author: String,
}

impl WebFetchTool {
  pub fn new(log: EventLog, author: String) -> Self {
    let http = Client::builder()
      .timeout(REQUEST_TIMEOUT)
      .build()
      .unwrap_or_else(|_| Client::new());
    Self { http, log, author }
  }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct WebFetchArgs {
  pub url: String,
  #[serde(default)]
  pub max_chars: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebFetchOutput {
  pub url: String,
  pub markdown: String,
  /// `true` when the body exceeded `max_chars` and was cut.
  pub truncated: bool,
}

#[derive(Debug, Error)]
pub enum WebFetchError {
  #[error("crawl4ai request failed: {0}")]
  Request(#[from] reqwest::Error),
  #[error("crawl4ai returned HTTP {0}")]
  HttpStatus(u16),
  #[error("crawl4ai scrape failed: {0}")]
  Scrape(String),
  #[error("crawl4ai returned no markdown content")]
  NoMarkdown,
}

#[derive(Serialize)]
struct MdRequest<'a> {
  url: &'a str,
  /// "fit" returns LLM-optimised markdown with noise removed.
  f: &'a str,
}

#[derive(Deserialize)]
struct MdResponse {
  success: bool,
  markdown: Option<String>,
  error: Option<String>,
}

impl Tool for WebFetchTool {
  const NAME: &'static str = NAME;
  type Args = WebFetchArgs;
  type Output = WebFetchOutput;
  type Error = WebFetchError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Fetches a URL and returns its main content as Markdown. \
                    Uses a headless browser for JavaScript-rendered pages and \
                    single-page applications. Output is pre-cleaned \
                    (nav/ads/footer dropped) and token-efficient."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "url": {
            "type": "string",
            "description": "Absolute http(s) URL to fetch."
          },
          "max_chars": {
            "type": "integer",
            "description": "Optional cap on the returned Markdown length. \
                            Defaults to 12000.",
            "minimum": 256
          }
        },
        "required": ["url"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let max_chars = args
      .max_chars
      .unwrap_or(DEFAULT_MAX_CHARS)
      .max(MIN_MAX_CHARS);

    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Fetching {}", args.url),
        String::new(),
      )
      .await;

    let outcome = self.fetch_markdown(&args.url, max_chars).await;

    match outcome {
      Ok(output) => {
        let (preview, _) = truncate_chars(&output.markdown, NOTE_PREVIEW_CHARS);
        row
          .replace_body(
            INLINE_NOTE_TEXT.to_string(),
            format!("URL: {}\n\n{preview}", output.url),
          )
          .await;
        row.finish(RowStatus::Done).await;
        Ok(output)
      }
      Err(error) => {
        row
          .replace_body(
            INLINE_NOTE_FAIL_TEXT.to_string(),
            format!("URL: {}\n\n{error}", args.url),
          )
          .await;
        row.finish(RowStatus::Failed).await;
        Err(error)
      }
    }
  }
}

impl WebFetchTool {
  async fn fetch_markdown(
    &self,
    url: &str,
    max_chars: usize,
  ) -> Result<WebFetchOutput, WebFetchError> {
    let response = self
      .http
      .post(format!("{CRAWL4AI_URL}/md"))
      .json(&MdRequest { url, f: "fit" })
      .send()
      .await?;

    if !response.status().is_success() {
      return Err(WebFetchError::HttpStatus(response.status().as_u16()));
    }

    let body: MdResponse = response.json().await?;
    if !body.success {
      let msg = body.error.unwrap_or_else(|| "unknown error".to_string());
      return Err(WebFetchError::Scrape(msg));
    }

    let markdown = body.markdown.ok_or(WebFetchError::NoMarkdown)?;
    let (markdown, truncated) = truncate_chars(&markdown, max_chars);
    Ok(WebFetchOutput {
      url: url.to_string(),
      markdown,
      truncated,
    })
  }
}

fn truncate_chars(text: &str, max_chars: usize) -> (String, bool) {
  if text.chars().count() <= max_chars {
    return (text.to_string(), false);
  }
  let mut out: String = text.chars().take(max_chars).collect();
  out.push_str("\n\n... (truncated)");
  (out, true)
}
