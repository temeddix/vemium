//! `web_fetch` tool: fetch a URL and return its main content as Markdown.
//!
//! The conversion pipeline is:
//!
//! 1. `reqwest::get` (with a short timeout and a friendly user-agent).
//! 2. `dom_smoothie::Readability` - extract the article-like body, dropping
//!    nav/footer/sidebar/ads. Falls back to the raw HTML on failure.
//! 3. `htmd::convert` - turn the cleaned HTML into Markdown.
//! 4. Truncate to `max_chars` (default 12k) so the result fits comfortably
//!    inside the model's context.
//!
//! HTML->Markdown saves dramatic amounts of tokens compared with feeding
//! raw HTML; in practice 60-90% reduction on real-world articles.

use dom_smoothie::{Config, Readability};
use reqwest::Client;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;
use thiserror::Error;

const NAME: &str = "web_fetch";
const DEFAULT_MAX_CHARS: usize = 12_000;
const MIN_MAX_CHARS: usize = 256;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const USER_AGENT: &str = "Mozilla/5.0 (compatible; VemiumDebateBot/1.0; +https://github.com/cunarist/vemium)";

/// Owns the shared `reqwest::Client`. Cheap to clone.
#[derive(Debug, Clone)]
pub struct WebFetchTool {
  http: Client,
}

impl WebFetchTool {
  pub fn new() -> Self {
    let http = Client::builder()
      .timeout(REQUEST_TIMEOUT)
      .user_agent(USER_AGENT)
      .build()
      .unwrap_or_else(|_| Client::new());
    Self { http }
  }
}

impl Default for WebFetchTool {
  fn default() -> Self {
    Self::new()
  }
}

#[derive(Debug, Deserialize)]
pub struct WebFetchArgs {
  pub url: String,
  #[serde(default)]
  pub max_chars: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct WebFetchOutput {
  pub url: String,
  pub markdown: String,
  /// `true` when the body exceeded `max_chars` and was cut.
  pub truncated: bool,
}

/// Anything that can go wrong before the body is in hand. After we have a
/// body the conversion pipeline degrades gracefully (`htmd` failures fall
/// back to the cleaned HTML), so this enum stays small.
#[derive(Debug, Error)]
pub enum WebFetchError {
  #[error("fetch failed: {0}")]
  Request(#[from] reqwest::Error),
  #[error("{url} returned HTTP {status}")]
  Status { url: String, status: u16 },
}

impl Tool for WebFetchTool {
  const NAME: &'static str = NAME;
  type Args = WebFetchArgs;
  type Output = WebFetchOutput;
  type Error = WebFetchError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Fetches a URL and returns its main article content \
                    converted to Markdown. Use this when you need to read \
                    a public web page; the output is pre-cleaned \
                    (nav/ads/footer dropped) so it is much shorter than \
                    raw HTML."
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

    let response = self.http.get(&args.url).send().await?;
    if !response.status().is_success() {
      return Err(WebFetchError::Status {
        url: args.url,
        status: response.status().as_u16(),
      });
    }
    let html = response.text().await?;

    let cleaned_html = extract_main_content(&html, &args.url);
    let markdown = htmd::convert(&cleaned_html).unwrap_or(cleaned_html);
    let trimmed = collapse_whitespace(&markdown);
    let (markdown, truncated) = truncate_chars(&trimmed, max_chars);

    Ok(WebFetchOutput {
      url: args.url,
      markdown,
      truncated,
    })
  }
}

/// Runs Readability on `html`, returning the cleaned article HTML. If the
/// extractor fails (e.g., on a non-article page), returns `html` unchanged.
fn extract_main_content(html: &str, url: &str) -> String {
  let config = Config::default();
  match Readability::new(html, Some(url), Some(config)) {
    Ok(mut reader) => match reader.parse() {
      Ok(article) => article.content.to_string(),
      Err(_) => html.to_string(),
    },
    Err(_) => html.to_string(),
  }
}

fn collapse_whitespace(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  let mut blank_run = 0;
  for line in text.lines() {
    let trimmed = line.trim_end();
    if trimmed.is_empty() {
      blank_run += 1;
      if blank_run <= 1 {
        out.push('\n');
      }
    } else {
      blank_run = 0;
      out.push_str(trimmed);
      out.push('\n');
    }
  }
  out
}

fn truncate_chars(text: &str, max_chars: usize) -> (String, bool) {
  if text.chars().count() <= max_chars {
    return (text.to_string(), false);
  }
  let mut out: String = text.chars().take(max_chars).collect();
  out.push_str("\n\n... (truncated)");
  (out, true)
}
