//! Workspace tools: agents manage files inside the room workspace.
//!
//! Three tools are exported:
//!
//! - [`ListFilesTool`] - recursively list files inside the workspace.
//! - [`ReadFileTool`] - read a UTF-8 file (truncated at the workspace's
//!   read limit).
//! - [`WriteFileTool`] - overwrite a file (creates parents as needed).
//!
//! All paths are routed through [`crate::workspace::RoomWorkspace::resolve`],
//! which rejects anything that escapes the room's directory. Each tool
//! persists its own inline-note breadcrumb via [`EventLog`] before
//! returning to the model.

use crate::event_log::{EventLog, RowHandle};
use crate::models::{RoomEventKind, RowStatus};
use crate::workspace::RoomWorkspace;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::Path;
use thiserror::Error;

/// Markdown preview cap for `read_file` inline-note `detail`.
const READ_PREVIEW_CHARS: usize = 2_000;

#[derive(Debug, Error)]
#[error("{0}")]
pub struct WorkspaceToolError(String);

impl WorkspaceToolError {
  fn from_anyhow(error: anyhow::Error) -> Self {
    Self(error.to_string())
  }
}

/// Opens a fresh inline-note row scoped to `author`.
async fn open_row(log: &EventLog, author: &str, label: String) -> RowHandle {
  log
    .start_row(
      RoomEventKind::InlineNote,
      Some(author.to_string()),
      label,
      String::new(),
    )
    .await
}

async fn finish_ok(row: &RowHandle, label: String, detail: String) {
  row.replace_body(label, detail).await;
  row.finish(RowStatus::Done).await;
}

async fn finish_err(row: &RowHandle, label: String, detail: String) {
  row.replace_body(label, detail).await;
  row.finish(RowStatus::Failed).await;
}

// -- list_files ------------------------------------------------------------

pub const LIST_FILES_NAME: &str = "list_files";

#[derive(Clone)]
pub struct ListFilesTool {
  workspace: RoomWorkspace,
  log: EventLog,
  author: String,
}

impl ListFilesTool {
  pub fn new(workspace: RoomWorkspace, log: EventLog, author: String) -> Self {
    Self {
      workspace,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ListFilesArgs {
  /// Workspace-relative directory; `None` (or `""`) means the room root.
  #[serde(default)]
  pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListFilesOutput {
  pub files: Vec<WorkspaceFileEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceFileEntry {
  pub path: String,
  pub size_bytes: u64,
}

impl Tool for ListFilesTool {
  const NAME: &'static str = LIST_FILES_NAME;
  type Args = ListFilesArgs;
  type Output = ListFilesOutput;
  type Error = WorkspaceToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: LIST_FILES_NAME.to_string(),
      description: "Recursively lists files inside the room workspace at \
                    `path` (relative). If `path` is omitted, lists from the \
                    room root. Hidden directories such as `.venv` are \
                    skipped."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": {
            "type": "string",
            "description": "Workspace-relative directory; '' or omitted \
              means the room root."
          }
        }
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let relative = args.path.clone().unwrap_or_default();
    let dir_label = if relative.is_empty() {
      ".".to_string()
    } else {
      relative.clone()
    };
    let row = open_row(
      &self.log,
      &self.author,
      format!("Listing files in {dir_label}"),
    )
    .await;
    let target = if relative.is_empty() {
      Path::new(".")
    } else {
      Path::new(relative.as_str())
    };
    match self.workspace.list_files(target).await {
      Ok(files) => {
        let entries: Vec<_> = files
          .into_iter()
          .map(|f| WorkspaceFileEntry {
            path: f.relative_path,
            size_bytes: f.size_bytes,
          })
          .collect();
        let detail = if entries.is_empty() {
          "(empty)".to_string()
        } else {
          entries
            .iter()
            .map(|f| format!("- {} ({} bytes)", f.path, f.size_bytes))
            .collect::<Vec<_>>()
            .join("\n")
        };
        finish_ok(&row, format!("Listed files in {dir_label}"), detail).await;
        Ok(ListFilesOutput { files: entries })
      }
      Err(error) => {
        let error = WorkspaceToolError::from_anyhow(error);
        finish_err(
          &row,
          "File listing failed".to_string(),
          format!("Directory: {dir_label}\n\n{}", error.0),
        )
        .await;
        Err(error)
      }
    }
  }
}

// -- read_file -------------------------------------------------------------

pub const READ_FILE_NAME: &str = "read_file";

#[derive(Clone)]
pub struct ReadFileTool {
  workspace: RoomWorkspace,
  log: EventLog,
  author: String,
}

impl ReadFileTool {
  pub fn new(workspace: RoomWorkspace, log: EventLog, author: String) -> Self {
    Self {
      workspace,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ReadFileArgs {
  pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadFileOutput {
  pub path: String,
  pub contents: String,
}

impl Tool for ReadFileTool {
  const NAME: &'static str = READ_FILE_NAME;
  type Args = ReadFileArgs;
  type Output = ReadFileOutput;
  type Error = WorkspaceToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: READ_FILE_NAME.to_string(),
      description: "Reads a UTF-8 text file from the room workspace. Output \
                    is truncated at the workspace's read limit (~64 KiB)."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": {
            "type": "string",
            "description": "Workspace-relative path."
          }
        },
        "required": ["path"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = open_row(
      &self.log,
      &self.author,
      format!("Reading file {}", args.path),
    )
    .await;
    match self.workspace.read_file(Path::new(&args.path)).await {
      Ok(contents) => {
        let preview = preview_chars(&contents, READ_PREVIEW_CHARS);
        finish_ok(&row, format!("Read file {}", args.path), preview).await;
        Ok(ReadFileOutput {
          path: args.path,
          contents,
        })
      }
      Err(error) => {
        let error = WorkspaceToolError::from_anyhow(error);
        finish_err(
          &row,
          "File read failed".to_string(),
          format!("Path: {}\n\n{}", args.path, error.0),
        )
        .await;
        Err(error)
      }
    }
  }
}

// -- write_file ------------------------------------------------------------

pub const WRITE_FILE_NAME: &str = "write_file";

#[derive(Clone)]
pub struct WriteFileTool {
  workspace: RoomWorkspace,
  log: EventLog,
  author: String,
}

impl WriteFileTool {
  pub fn new(workspace: RoomWorkspace, log: EventLog, author: String) -> Self {
    Self {
      workspace,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct WriteFileArgs {
  pub path: String,
  pub contents: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteFileOutput {
  pub path: String,
  pub bytes_written: usize,
}

impl Tool for WriteFileTool {
  const NAME: &'static str = WRITE_FILE_NAME;
  type Args = WriteFileArgs;
  type Output = WriteFileOutput;
  type Error = WorkspaceToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: WRITE_FILE_NAME.to_string(),
      description: "Writes (or overwrites) a UTF-8 text file in the room \
                    workspace. Parent directories are created as needed. \
                    Use this to author Python scripts before calling \
                    `run_python`, edit `pyproject.toml` to add dependencies, \
                    or save intermediate notes."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": {
            "type": "string",
            "description": "Workspace-relative path."
          },
          "contents": {
            "type": "string",
            "description": "Full file contents."
          }
        },
        "required": ["path", "contents"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = open_row(
      &self.log,
      &self.author,
      format!("Writing file {}", args.path),
    )
    .await;
    let bytes_written = args.contents.len();
    match self
      .workspace
      .write_file(Path::new(&args.path), &args.contents)
      .await
    {
      Ok(()) => {
        finish_ok(
          &row,
          format!("Wrote file {}", args.path),
          format!("{bytes_written} bytes written"),
        )
        .await;
        Ok(WriteFileOutput {
          path: args.path,
          bytes_written,
        })
      }
      Err(error) => {
        let error = WorkspaceToolError::from_anyhow(error);
        finish_err(
          &row,
          "File write failed".to_string(),
          format!("Path: {}\n\n{}", args.path, error.0),
        )
        .await;
        Err(error)
      }
    }
  }
}

fn preview_chars(text: &str, max_chars: usize) -> String {
  if text.chars().count() <= max_chars {
    return text.to_string();
  }
  let mut out: String = text.chars().take(max_chars).collect();
  out.push_str("\n\n... (truncated)");
  out
}
