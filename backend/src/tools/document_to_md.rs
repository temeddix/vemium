//! `document_to_md` tool: converts a local document inside the room
//! workspace to Markdown via [`kreuzberg`].
//!
//! Handles the full kreuzberg surface compiled into this build: PDF,
//! Excel, Office (DOCX/PPTX), email (`.eml`/`.msg`), HTML, XML, archives,
//! HWP (Korean docs), iWork, MDX, plus OCR for image-bearing inputs.
//!
//! Output is written next to the source as `<basename>.md` (sandboxed by
//! [`crate::workspace::RoomWorkspace::resolve`]). Small results are
//! returned inline; large ones return only path + preview, matching the
//! `web_fetch` contract so the agent has a uniform mental model.

use crate::event_log::EventLog;
use crate::models::RoomEventKind;
use crate::workspace::RoomWorkspace;
use kreuzberg::{ExtractionConfig, extract_file};
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use thiserror::Error;

pub const NAME: &str = "document_to_md";
pub const INLINE_NOTE_OK: &str = "Converted document";
pub const INLINE_NOTE_FAIL: &str = "Document conversion failed";

/// Char count above which the body is omitted from the tool result and the
/// agent must read the saved file. Mirrors `web_fetch`'s threshold so the
/// "small inline / large path-only" contract is consistent.
const INLINE_THRESHOLD_CHARS: usize = 12_000;
const PREVIEW_CHARS: usize = 2_000;

#[derive(Clone)]
pub struct DocumentToMdTool {
  workspace: RoomWorkspace,
  log: EventLog,
  author: String,
}

impl DocumentToMdTool {
  pub fn new(workspace: RoomWorkspace, log: EventLog, author: String) -> Self {
    Self {
      workspace,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct DocumentToMdArgs {
  /// Workspace-relative path to the source document.
  pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentToMdOutput {
  /// Workspace-relative path of the resulting `.md` file.
  pub path: String,
  /// Total Markdown length (chars). Always populated, even when `markdown`
  /// is `None` because the body was too large to inline.
  pub total_chars: usize,
  /// Inline body when small enough; `None` when above the threshold and
  /// the agent must read the file via `workspace`.
  pub markdown: Option<String>,
}

#[derive(Debug, Error)]
#[error("{0}")]
pub struct DocumentToMdError(String);

impl DocumentToMdError {
  fn from_anyhow(error: anyhow::Error) -> Self {
    Self(error.to_string())
  }

  fn other(message: impl Into<String>) -> Self {
    Self(message.into())
  }
}

impl Tool for DocumentToMdTool {
  const NAME: &'static str = NAME;
  type Args = DocumentToMdArgs;
  type Output = DocumentToMdOutput;
  type Error = DocumentToMdError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Converts a local document into Markdown via kreuzberg. \
                    Supports PDF, XLSX, DOCX, PPTX, eml/msg, HTML, archives, \
                    images (OCR), and more. Output is written next to the \
                    source as `<basename>.md`; small results are returned \
                    inline, larger results return only the path and a preview."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": {
            "type": "string",
            "description": "Workspace-relative path to the source document \
                            (e.g. 'basket/2025_Q1_BS.pdf')."
          }
        },
        "required": ["path"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Converting {}", args.path),
        String::new(),
      )
      .await;

    match self.convert(&args.path).await {
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
              args.path, output.path, output.total_chars,
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
            format!("{}\n\n{error}", args.path),
          )
          .await;
        row.finish(false).await;
        Err(error)
      }
    }
  }
}

impl DocumentToMdTool {
  async fn convert(
    &self,
    relative: &str,
  ) -> Result<DocumentToMdOutput, DocumentToMdError> {
    let relative_path = Path::new(relative);
    let source = self
      .workspace
      .resolve(relative_path)
      .map_err(DocumentToMdError::from_anyhow)?;

    let stem = source
      .file_stem()
      .ok_or_else(|| DocumentToMdError::other("source has no file stem"))?
      .to_string_lossy()
      .into_owned();

    let target_relative: PathBuf = match relative_path.parent() {
      Some(parent) if !parent.as_os_str().is_empty() => {
        parent.join(format!("{stem}.md"))
      }
      _ => PathBuf::from(format!("{stem}.md")),
    };

    let source_str = source.to_string_lossy().into_owned();
    let config = ExtractionConfig::default();
    let result = extract_file(&source_str, None, &config)
      .await
      .map_err(|e| DocumentToMdError::other(format!("kreuzberg: {e}")))?;
    let markdown = result.content;
    let total_chars = markdown.chars().count();

    self
      .workspace
      .write_file(&target_relative, &markdown)
      .await
      .map_err(DocumentToMdError::from_anyhow)?;

    let inline = if total_chars <= INLINE_THRESHOLD_CHARS {
      Some(markdown)
    } else {
      None
    };

    Ok(DocumentToMdOutput {
      path: target_relative.to_string_lossy().into_owned(),
      total_chars,
      markdown: inline,
    })
  }
}

fn truncate(text: &str, max_chars: usize) -> String {
  if text.chars().count() <= max_chars {
    return text.to_string();
  }
  let mut out: String = text.chars().take(max_chars).collect();
  out.push_str("\n\n... (preview truncated)");
  out
}
