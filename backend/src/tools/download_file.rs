//! `download_file` tool: saves an arbitrary HTTP response body into the
//! room workspace under `raw/`.
//!
//! The agent supplies a full HTTP envelope (URL, method, headers, optional
//! body) so DART-style flows that hide a download behind a JS handler can
//! be reproduced verbatim once the agent has captured the underlying
//! request via the Playwright MCP `browser_network_requests` tool.
//!
//! Filename selection follows a fixed fallback chain:
//!
//! 1. `Content-Disposition: filename=...` from the response.
//! 2. The last URL path segment (with query stripped).
//! 3. A hex hash of the request envelope.
//!
//! Progress streams into the inline-note `body` as bytes accumulate, in
//! the same shape `python::RunPythonTool` uses for stdout streaming, so
//! a slow download is visible in the timeline before it completes.

use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant};

use crate::event_log::{EventLog, RowHandle};
use crate::models::RoomEventKind;
use crate::workspace::RoomWorkspace;
use futures::StreamExt;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::io::AsyncWriteExt;

pub const NAME: &str = "download_file";
pub const INLINE_NOTE_OK: &str = "Downloaded file";
pub const INLINE_NOTE_FAIL: &str = "Download failed";

const RAW_DIR: &str = "raw";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(180);
/// Minimum interval between inline-note progress updates. Prevents the
/// row from being rewritten faster than the UI can render.
const PROGRESS_UPDATE_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Clone)]
pub struct DownloadFileTool {
  workspace: RoomWorkspace,
  http: reqwest::Client,
  log: EventLog,
  author: String,
}

impl DownloadFileTool {
  pub fn new(workspace: RoomWorkspace, log: EventLog, author: String) -> Self {
    let http = reqwest::Client::builder()
      .timeout(REQUEST_TIMEOUT)
      .build()
      .unwrap_or_else(|_| reqwest::Client::new());
    Self {
      workspace,
      http,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct DownloadFileArgs {
  pub url: String,
  /// HTTP method (`GET` / `POST` / `PUT`); defaults to `GET`.
  #[serde(default)]
  pub method: Option<String>,
  /// Headers to attach. Common ones: `Cookie`, `Referer`, `User-Agent`.
  #[serde(default)]
  pub headers: HashMap<String, String>,
  /// Request body (only meaningful for POST/PUT). Sent verbatim.
  #[serde(default)]
  pub body: Option<String>,
  /// Override the auto-derived filename. Stored under `raw/`.
  #[serde(default)]
  pub filename: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DownloadFileOutput {
  /// Workspace-relative path of the saved file (always under `raw/`).
  pub path: String,
  pub size_bytes: u64,
  pub content_type: Option<String>,
}

#[derive(Debug, Error)]
#[error("{0}")]
pub struct DownloadFileError(String);

impl DownloadFileError {
  fn from_anyhow(error: anyhow::Error) -> Self {
    Self(error.to_string())
  }

  fn other(message: impl Into<String>) -> Self {
    Self(message.into())
  }
}

impl Tool for DownloadFileTool {
  const NAME: &'static str = NAME;
  type Args = DownloadFileArgs;
  type Output = DownloadFileOutput;
  type Error = DownloadFileError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Performs an HTTP request and saves the response body \
                    under `raw/`. Use for binary downloads (PDF, XLSX, \
                    ZIP), authenticated endpoints (pass cookies via \
                    `headers`), or APIs returning non-HTML payloads. The \
                    filename comes from `Content-Disposition`, the URL \
                    basename, or a hash — pass `filename` to override. \
                    Progress streams into the inline note in real time."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "url": {
            "type": "string",
            "description": "Absolute http(s) URL."
          },
          "method": {
            "type": "string",
            "description": "HTTP method (default GET)."
          },
          "headers": {
            "type": "object",
            "description": "Request headers (e.g. Cookie, Referer, \
                            User-Agent).",
            "additionalProperties": { "type": "string" }
          },
          "body": {
            "type": "string",
            "description": "Request body for POST/PUT. Sent verbatim."
          },
          "filename": {
            "type": "string",
            "description": "Override the saved filename. Stored under \
                            raw/."
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
        format!("Downloading {}", args.url),
        String::new(),
      )
      .await;

    match self.download(&args, &row).await {
      Ok(output) => {
        row
          .replace_body(
            INLINE_NOTE_OK.to_string(),
            format!(
              "{} -> {} ({} bytes{})",
              args.url,
              output.path,
              output.size_bytes,
              output
                .content_type
                .as_ref()
                .map(|c| format!(", {c}"))
                .unwrap_or_default(),
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

impl DownloadFileTool {
  async fn download(
    &self,
    args: &DownloadFileArgs,
    row: &RowHandle,
  ) -> Result<DownloadFileOutput, DownloadFileError> {
    let method = parse_method(args.method.as_deref())?;
    let headers = build_headers(&args.headers)?;

    let mut request = self.http.request(method, &args.url).headers(headers);
    if let Some(body) = &args.body {
      request = request.body(body.clone());
    }
    let response = request
      .send()
      .await
      .map_err(|e| DownloadFileError::other(format!("request failed: {e}")))?;

    if !response.status().is_success() {
      return Err(DownloadFileError::other(format!(
        "HTTP {}",
        response.status()
      )));
    }

    let content_type = response
      .headers()
      .get(reqwest::header::CONTENT_TYPE)
      .and_then(|v| v.to_str().ok())
      .map(|s| s.to_string());

    let resolved_filename = args
      .filename
      .as_deref()
      .map(sanitize_filename)
      .or_else(|| filename_from_content_disposition(response.headers()))
      .or_else(|| filename_from_url(&args.url))
      .unwrap_or_else(|| envelope_hash_filename(args, content_type.as_deref()));

    let target_relative = format!("{RAW_DIR}/{resolved_filename}");

    let mut file = self
      .workspace
      .create_file(Path::new(&target_relative))
      .await
      .map_err(DownloadFileError::from_anyhow)?;

    let total_hint = response.content_length();
    let mut received: u64 = 0;
    let mut last_update = Instant::now();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
      let chunk = chunk.map_err(|e| {
        DownloadFileError::other(format!("read chunk failed: {e}"))
      })?;
      file.write_all(&chunk).await.map_err(|e| {
        DownloadFileError::other(format!("write chunk failed: {e}"))
      })?;
      received += chunk.len() as u64;
      if last_update.elapsed() >= PROGRESS_UPDATE_INTERVAL {
        last_update = Instant::now();
        row
          .replace_body(
            format!("Downloading {} ({} B so far)", args.url, received),
            progress_body(received, total_hint),
          )
          .await;
      }
    }
    file
      .flush()
      .await
      .map_err(|e| DownloadFileError::other(format!("flush failed: {e}")))?;

    Ok(DownloadFileOutput {
      path: target_relative,
      size_bytes: received,
      content_type,
    })
  }
}

fn parse_method(
  raw: Option<&str>,
) -> Result<reqwest::Method, DownloadFileError> {
  match raw {
    None => Ok(reqwest::Method::GET),
    Some(s) => reqwest::Method::from_bytes(s.trim().to_uppercase().as_bytes())
      .map_err(|_| DownloadFileError::other(format!("invalid method: {s}"))),
  }
}

fn build_headers(
  raw: &HashMap<String, String>,
) -> Result<HeaderMap, DownloadFileError> {
  let mut headers = HeaderMap::with_capacity(raw.len());
  for (name, value) in raw {
    let header_name =
      HeaderName::from_bytes(name.as_bytes()).map_err(|_| {
        DownloadFileError::other(format!("invalid header name: {name}"))
      })?;
    let header_value = HeaderValue::from_str(value).map_err(|_| {
      DownloadFileError::other(format!("invalid header value for {name}"))
    })?;
    headers.insert(header_name, header_value);
  }
  Ok(headers)
}

fn filename_from_content_disposition(headers: &HeaderMap) -> Option<String> {
  let cd = headers.get(reqwest::header::CONTENT_DISPOSITION)?;
  let cd = cd.to_str().ok()?;
  // Minimal parse: look for `filename=...` (with or without quotes).
  // RFC 5987 `filename*=UTF-8''...` is not handled — fall back to URL.
  let lowered = cd.to_ascii_lowercase();
  let pos = lowered.find("filename=")?;
  let after = &cd[pos + "filename=".len()..];
  let value = after.trim().trim_start_matches(';').trim();
  let value = value
    .trim_start_matches('"')
    .trim_start_matches('\'')
    .split(['"', '\'', ';'])
    .next()
    .unwrap_or(value)
    .trim();
  if value.is_empty() {
    None
  } else {
    Some(sanitize_filename(value))
  }
}

fn filename_from_url(url: &str) -> Option<String> {
  let parsed = reqwest::Url::parse(url).ok()?;
  let last = parsed.path_segments()?.next_back()?;
  if last.is_empty() {
    None
  } else {
    Some(sanitize_filename(last))
  }
}

fn envelope_hash_filename(
  args: &DownloadFileArgs,
  content_type: Option<&str>,
) -> String {
  let mut hasher = Sha256::new();
  hasher.update(args.url.as_bytes());
  if let Some(method) = &args.method {
    hasher.update(method.as_bytes());
  }
  if let Some(body) = &args.body {
    hasher.update(body.as_bytes());
  }
  let digest = hasher.finalize();
  let prefix: String =
    digest.iter().take(8).map(|b| format!("{b:02x}")).collect();
  let ext = content_type
    .and_then(extension_from_content_type)
    .unwrap_or("bin");
  format!("download_{prefix}.{ext}")
}

fn extension_from_content_type(ct: &str) -> Option<&'static str> {
  let ct = ct
    .split(';')
    .next()
    .unwrap_or(ct)
    .trim()
    .to_ascii_lowercase();
  match ct.as_str() {
    "application/pdf" => Some("pdf"),
    "application/zip" => Some("zip"),
    "application/json" => Some("json"),
    "application/xml" | "text/xml" => Some("xml"),
    "text/html" => Some("html"),
    "text/plain" => Some("txt"),
    "text/csv" => Some("csv"),
    "image/png" => Some("png"),
    "image/jpeg" => Some("jpg"),
    "image/gif" => Some("gif"),
    "image/webp" => Some("webp"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => {
      Some("xlsx")
    }
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" => {
      Some("docx")
    }
    "application/vnd.openxmlformats-officedocument.presentationml.presentation" => {
      Some("pptx")
    }
    _ => None,
  }
}

fn sanitize_filename(input: &str) -> String {
  let trimmed = input.trim();
  let cleaned: String = trimmed
    .chars()
    .map(|c| match c {
      '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0' => '_',
      c if c.is_control() => '_',
      c => c,
    })
    .collect();
  let cleaned = cleaned.trim_matches('.');
  if cleaned.is_empty() {
    return "download.bin".to_string();
  }
  cleaned.to_string()
}

fn progress_body(received: u64, total: Option<u64>) -> String {
  match total {
    Some(total) if total > 0 => {
      let pct = (received as f64 / total as f64 * 100.0).clamp(0.0, 100.0);
      format!("{received} / {total} bytes ({pct:.1}%)")
    }
    _ => format!("{received} bytes received"),
  }
}
