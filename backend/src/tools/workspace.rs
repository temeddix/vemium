//! Workspace tools: agents manage their own subject folders and files.
//!
//! Five tools are exported:
//!
//! - [`ListSubjectFoldersTool`] - discover what subjects already exist.
//! - [`CreateSubjectFolderTool`] - make a new `<datetime> (<subject>)`
//!   folder.
//! - [`ListFilesTool`] - recursively list files inside a folder.
//! - [`ReadFileTool`] - read a UTF-8 file (truncated at the workspace's
//!   read limit).
//! - [`WriteFileTool`] - overwrite a file (creates parents as needed).
//!
//! All paths are routed through [`crate::workspace::RoomWorkspace::resolve`],
//! which rejects anything that escapes the room's directory.

use crate::tools::InlineNote;
use crate::workspace::RoomWorkspace;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::Path;
use thiserror::Error;

/// Markdown preview cap for `read_file` inline-note `detail`. Avoids
/// dumping the full 64 KiB read limit into the click-to-reveal dialog.
const READ_PREVIEW_CHARS: usize = 2_000;

#[derive(Debug, Error)]
#[error("{0}")]
pub struct WorkspaceToolError(String);

impl WorkspaceToolError {
  fn from_anyhow(error: anyhow::Error) -> Self {
    Self(error.to_string())
  }
}

// -- list_subject_folders --------------------------------------------------

pub const LIST_FOLDERS_NAME: &str = "list_subject_folders";
pub const LIST_FOLDERS_NOTE_TEXT: &str = "Listed subject folders";
pub const LIST_FOLDERS_NOTE_FAIL_TEXT: &str = "Subject folder listing failed";

#[derive(Debug, Clone)]
pub struct ListSubjectFoldersTool {
  workspace: RoomWorkspace,
}

impl ListSubjectFoldersTool {
  pub fn new(workspace: RoomWorkspace) -> Self {
    Self { workspace }
  }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ListSubjectFoldersArgs {}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListSubjectFoldersOutput {
  pub folders: Vec<SubjectFolderEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubjectFolderEntry {
  pub name: String,
  /// `true` if the folder follows the canonical `<datetime> (<subject>)`
  /// convention. Off-format folders are still listed so the agent can read
  /// what the user (or a previous agent) put there.
  pub structured: bool,
}

impl Tool for ListSubjectFoldersTool {
  const NAME: &'static str = LIST_FOLDERS_NAME;
  type Args = ListSubjectFoldersArgs;
  type Output = ListSubjectFoldersOutput;
  type Error = WorkspaceToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: LIST_FOLDERS_NAME.to_string(),
      description: "Lists every subject folder under the room's workspace. \
                    Use this before deciding whether to reuse an existing \
                    folder or create a new one. Folders not in the \
                    conventional `<datetime> (<subject>)` format are still \
                    reported but flagged as `structured: false`."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {}
      }),
    }
  }

  async fn call(&self, _args: Self::Args) -> Result<Self::Output, Self::Error> {
    let folders = self
      .workspace
      .list_subject_folders()
      .await
      .map_err(WorkspaceToolError::from_anyhow)?;
    Ok(ListSubjectFoldersOutput {
      folders: folders
        .into_iter()
        .map(|f| SubjectFolderEntry {
          name: f.name,
          structured: f.structured,
        })
        .collect(),
    })
  }
}

// -- create_subject_folder -------------------------------------------------

pub const CREATE_FOLDER_NAME: &str = "create_subject_folder";
pub const CREATE_FOLDER_NOTE_FAIL_TEXT: &str = "Subject folder creation failed";

#[derive(Debug, Clone)]
pub struct CreateSubjectFolderTool {
  workspace: RoomWorkspace,
}

impl CreateSubjectFolderTool {
  pub fn new(workspace: RoomWorkspace) -> Self {
    Self { workspace }
  }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateSubjectFolderArgs {
  /// Short human-readable phrase describing the folder's purpose.
  pub subject: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSubjectFolderOutput {
  /// Resulting folder name on disk, e.g.
  /// `2026-05-03_14-23-05 (CPI categories)`.
  pub folder: String,
}

impl Tool for CreateSubjectFolderTool {
  const NAME: &'static str = CREATE_FOLDER_NAME;
  type Args = CreateSubjectFolderArgs;
  type Output = CreateSubjectFolderOutput;
  type Error = WorkspaceToolError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: CREATE_FOLDER_NAME.to_string(),
      description: "Creates a new subject folder named `<datetime> \
                    (<subject>)` inside the room's workspace. Returns the \
                    resulting folder name. The timestamp is generated \
                    server-side; only supply the subject phrase."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "subject": {
            "type": "string",
            "description": "Short human-readable phrase describing what the \
              folder is for (e.g. 'CPI category breakdown')."
          }
        },
        "required": ["subject"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let folder = self
      .workspace
      .create_subject_folder(&args.subject)
      .await
      .map_err(WorkspaceToolError::from_anyhow)?;
    Ok(CreateSubjectFolderOutput { folder })
  }
}

// -- list_files ------------------------------------------------------------

pub const LIST_FILES_NAME: &str = "list_files";
pub const LIST_FILES_NOTE_FAIL_TEXT: &str = "File listing failed";

#[derive(Debug, Clone)]
pub struct ListFilesTool {
  workspace: RoomWorkspace,
}

impl ListFilesTool {
  pub fn new(workspace: RoomWorkspace) -> Self {
    Self { workspace }
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
    let relative = args.path.unwrap_or_default();
    let target = if relative.is_empty() {
      Path::new(".")
    } else {
      Path::new(relative.as_str())
    };
    let files = self
      .workspace
      .list_files(target)
      .await
      .map_err(WorkspaceToolError::from_anyhow)?;
    Ok(ListFilesOutput {
      files: files
        .into_iter()
        .map(|f| WorkspaceFileEntry {
          path: f.relative_path,
          size_bytes: f.size_bytes,
        })
        .collect(),
    })
  }
}

// -- read_file -------------------------------------------------------------

pub const READ_FILE_NAME: &str = "read_file";
pub const READ_FILE_NOTE_FAIL_TEXT: &str = "File read failed";

#[derive(Debug, Clone)]
pub struct ReadFileTool {
  workspace: RoomWorkspace,
}

impl ReadFileTool {
  pub fn new(workspace: RoomWorkspace) -> Self {
    Self { workspace }
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
    let contents = self
      .workspace
      .read_file(Path::new(&args.path))
      .await
      .map_err(WorkspaceToolError::from_anyhow)?;
    Ok(ReadFileOutput {
      path: args.path,
      contents,
    })
  }
}

// -- write_file ------------------------------------------------------------

pub const WRITE_FILE_NAME: &str = "write_file";
pub const WRITE_FILE_NOTE_FAIL_TEXT: &str = "File write failed";

#[derive(Debug, Clone)]
pub struct WriteFileTool {
  workspace: RoomWorkspace,
}

impl WriteFileTool {
  pub fn new(workspace: RoomWorkspace) -> Self {
    Self { workspace }
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
    let bytes_written = args.contents.len();
    self
      .workspace
      .write_file(Path::new(&args.path), &args.contents)
      .await
      .map_err(WorkspaceToolError::from_anyhow)?;
    Ok(WriteFileOutput {
      path: args.path,
      bytes_written,
    })
  }
}

// -- inline-note formatters ------------------------------------------------

/// Inline-note for `list_subject_folders`. The detail surfaces the folder
/// names so the breadcrumb is a one-click stand-in for re-running the
/// listing.
pub fn format_list_subject_folders_inline_note(
  _args: &str,
  result: &str,
  ok: bool,
) -> InlineNote {
  if !ok {
    return InlineNote {
      text: LIST_FOLDERS_NOTE_FAIL_TEXT.to_string(),
      detail: result.to_string(),
    };
  }
  let detail = match serde_json::from_str::<ListSubjectFoldersOutput>(result) {
    Ok(parsed) => {
      if parsed.folders.is_empty() {
        "(none)".to_string()
      } else {
        parsed
          .folders
          .iter()
          .map(|f| {
            if f.structured {
              format!("- {}", f.name)
            } else {
              format!("- {} (off-format)", f.name)
            }
          })
          .collect::<Vec<_>>()
          .join("\n")
      }
    }
    Err(_) => result.to_string(),
  };
  InlineNote {
    text: LIST_FOLDERS_NOTE_TEXT.to_string(),
    detail,
  }
}

/// Inline-note for `create_subject_folder`. The label embeds the resulting
/// folder name (workspace-relative) so the user can read it from the
/// timeline without opening the detail dialog.
pub fn format_create_subject_folder_inline_note(
  args: &str,
  result: &str,
  ok: bool,
) -> InlineNote {
  if !ok {
    let subject = serde_json::from_str::<CreateSubjectFolderArgs>(args)
      .map(|a| a.subject)
      .unwrap_or_default();
    let detail = if subject.is_empty() {
      result.to_string()
    } else {
      format!("Subject: {subject}\n\n{result}")
    };
    return InlineNote {
      text: CREATE_FOLDER_NOTE_FAIL_TEXT.to_string(),
      detail,
    };
  }
  match serde_json::from_str::<CreateSubjectFolderOutput>(result) {
    Ok(parsed) => InlineNote {
      text: format!("Created subject folder {}", parsed.folder),
      detail: String::new(),
    },
    Err(_) => InlineNote {
      text: "Created subject folder".to_string(),
      detail: result.to_string(),
    },
  }
}

/// Inline-note for `list_files`. The label includes the listed directory
/// (workspace-relative, root rendered as `.`); the detail dumps the full
/// path/size table.
pub fn format_list_files_inline_note(
  args: &str,
  result: &str,
  ok: bool,
) -> InlineNote {
  let dir_label = match serde_json::from_str::<ListFilesArgs>(args)
    .map(|a| a.path.unwrap_or_default())
  {
    Ok(path) if !path.is_empty() => path,
    _ => ".".to_string(),
  };
  if !ok {
    return InlineNote {
      text: LIST_FILES_NOTE_FAIL_TEXT.to_string(),
      detail: format!("Directory: {dir_label}\n\n{result}"),
    };
  }
  let detail = match serde_json::from_str::<ListFilesOutput>(result) {
    Ok(parsed) => {
      if parsed.files.is_empty() {
        "(empty)".to_string()
      } else {
        parsed
          .files
          .iter()
          .map(|f| format!("- {} ({} bytes)", f.path, f.size_bytes))
          .collect::<Vec<_>>()
          .join("\n")
      }
    }
    Err(_) => result.to_string(),
  };
  InlineNote {
    text: format!("Listed files in {dir_label}"),
    detail,
  }
}

/// Inline-note for `read_file`. The label embeds the file path
/// (workspace-relative); the detail carries a leading-chunk preview rather
/// than the full contents to keep the click-to-reveal dialog manageable.
pub fn format_read_file_inline_note(
  args: &str,
  result: &str,
  ok: bool,
) -> InlineNote {
  let path = serde_json::from_str::<ReadFileArgs>(args)
    .map(|a| a.path)
    .unwrap_or_default();
  if !ok {
    let detail = if path.is_empty() {
      result.to_string()
    } else {
      format!("Path: {path}\n\n{result}")
    };
    return InlineNote {
      text: READ_FILE_NOTE_FAIL_TEXT.to_string(),
      detail,
    };
  }
  let label = if path.is_empty() {
    "Read file".to_string()
  } else {
    format!("Read file {path}")
  };
  let detail = match serde_json::from_str::<ReadFileOutput>(result) {
    Ok(parsed) => preview(&parsed.contents),
    Err(_) => preview(result),
  };
  InlineNote {
    text: label,
    detail,
  }
}

/// Inline-note for `write_file`. The label embeds the file path
/// (workspace-relative); the detail just records the byte count, since
/// echoing the full payload back would duplicate what is already on disk.
pub fn format_write_file_inline_note(
  args: &str,
  result: &str,
  ok: bool,
) -> InlineNote {
  let path = serde_json::from_str::<WriteFileArgs>(args)
    .map(|a| a.path)
    .unwrap_or_default();
  if !ok {
    let detail = if path.is_empty() {
      result.to_string()
    } else {
      format!("Path: {path}\n\n{result}")
    };
    return InlineNote {
      text: WRITE_FILE_NOTE_FAIL_TEXT.to_string(),
      detail,
    };
  }
  let label = if path.is_empty() {
    "Wrote file".to_string()
  } else {
    format!("Wrote file {path}")
  };
  let detail = match serde_json::from_str::<WriteFileOutput>(result) {
    Ok(parsed) => format!("{} bytes written", parsed.bytes_written),
    Err(_) => String::new(),
  };
  InlineNote {
    text: label,
    detail,
  }
}

fn preview(text: &str) -> String {
  if text.chars().count() <= READ_PREVIEW_CHARS {
    return text.to_string();
  }
  let mut out: String = text.chars().take(READ_PREVIEW_CHARS).collect();
  out.push_str("\n\n... (truncated)");
  out
}
