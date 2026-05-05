//! `run_python` tool: writes a Python script into the room's workspace and
//! runs it through the [`PythonRunner`] pipeline (`ruff format -> ruff check
//! -> ty check -> python`).
//!
//! Important behaviors:
//!
//! - The script lives at `<subject_folder>/<filename>` so artifacts produced
//!   by previous tool calls remain accessible.
//! - Lint and type-check failures abort *before* execution. The agent gets
//!   a structured `PythonRunResult` explaining which stage failed and what
//!   each tool reported, so it can fix the code and retry.
//! - The room's `python_timeout_seconds` governs the actual script run
//!   only; lint/type stages have a fixed short cap.

use crate::app_state::AppState;
use crate::python_runner::{PythonRunResult, PythonRunner, StageResult};
use crate::streaming::WsEvent;
use crate::workspace::RoomWorkspace;
use chrono::Utc;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fmt::Write as _;
use thiserror::Error;

const NAME: &str = "run_python";
const INLINE_NOTE_SUCCESS: &str = "Python script run success";
const INLINE_NOTE_FAIL: &str = "Python script run fail";

/// Tool that delegates to a [`PythonRunner`]. One instance per room/turn.
/// On every call the tool also emits an `InlineNote` summarizing the run so
/// the timeline shows whether the script went green end-to-end (or where it
/// got stuck), with the per-stage stdout/stderr available in the detail.
#[derive(Clone)]
pub struct RunPythonTool {
  workspace: RoomWorkspace,
  runner: PythonRunner,
  state: AppState,
  room_code: String,
  /// Author label used for the inline note. Personas pass their own name.
  author: String,
}

impl RunPythonTool {
  pub fn new(
    workspace: RoomWorkspace,
    runner: PythonRunner,
    state: AppState,
    room_code: String,
    author: String,
  ) -> Self {
    Self {
      workspace,
      runner,
      state,
      room_code,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct RunPythonArgs {
  /// Subject folder name (must already exist; create it via
  /// `create_subject_folder` first).
  pub subject_folder: String,
  /// Script filename inside the subject folder. Defaults to `script.py`.
  #[serde(default = "default_script_name")]
  pub script_name: String,
  /// Source code to write before running. Overwrites any existing file at
  /// the same path.
  pub source: String,
  /// Optional command-line arguments forwarded to the script.
  #[serde(default)]
  pub args: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct RunPythonOutput {
  pub script_path: String,
  pub result: PythonRunResult,
}

#[derive(Debug, Error)]
#[error("{0}")]
pub struct RunPythonError(String);

impl RunPythonError {
  fn from_anyhow(error: anyhow::Error) -> Self {
    Self(error.to_string())
  }
}

fn default_script_name() -> String {
  "script.py".to_string()
}

impl Tool for RunPythonTool {
  const NAME: &'static str = NAME;
  type Args = RunPythonArgs;
  type Output = RunPythonOutput;
  type Error = RunPythonError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Writes a Python script into a subject folder and \
                    executes it. The script runs after passing `ruff \
                    format`, `ruff check`, and `ty check`. If any of those \
                    fail, execution is aborted and the failures are \
                    reported back. Use `create_subject_folder` first if you \
                    need a new folder. Edit `pyproject.toml` (via \
                    `write_file` at the workspace root) to add Python \
                    dependencies."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "subject_folder": {
            "type": "string",
            "description": "Existing subject folder name, e.g. \
              '2026-05-03_14-23-05 (CPI categories)'."
          },
          "script_name": {
            "type": "string",
            "description": "Filename inside the subject folder. Defaults to \
              'script.py'."
          },
          "source": {
            "type": "string",
            "description": "Full Python source code. The script is written \
              as-is; you may use `# type: ignore` comments to suppress \
              specific type errors when truly necessary."
          },
          "args": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Optional command-line arguments."
          }
        },
        "required": ["subject_folder", "source"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let relative = format!("{}/{}", args.subject_folder, args.script_name);
    self
      .workspace
      .write_file(&relative, &args.source)
      .await
      .map_err(RunPythonError::from_anyhow)?;
    let result = self
      .runner
      .run(&relative, &args.args)
      .await
      .map_err(RunPythonError::from_anyhow)?;
    self.emit_inline_note(&result).await;
    Ok(RunPythonOutput {
      script_path: relative,
      result,
    })
  }
}

impl RunPythonTool {
  async fn emit_inline_note(&self, result: &PythonRunResult) {
    let text = if result.overall_ok {
      INLINE_NOTE_SUCCESS
    } else {
      INLINE_NOTE_FAIL
    };
    let stream = self.state.ensure_room_stream(&self.room_code).await;
    stream.send(WsEvent::InlineNote {
      author: self.author.clone(),
      text: text.to_string(),
      detail: format_run_detail(result),
      timestamp: Utc::now(),
    });
  }
}

/// Formats the full run pipeline as a single human-readable block: one section
/// per executed stage with its rendered command, exit code, duration, and
/// captured stdout/stderr. Truncated outputs already carry a marker from the
/// runner; we do not re-truncate here.
fn format_run_detail(result: &PythonRunResult) -> String {
  let mut out = String::new();
  for stage in &result.stages {
    if !out.is_empty() {
      out.push_str("\n\n");
    }
    append_stage(&mut out, stage);
  }
  if let Some(failed) = result.failed_at {
    if !out.is_empty() {
      out.push_str("\n\n");
    }
    let _ = write!(out, "Pipeline aborted at: {}", failed.label());
  }
  out
}

fn append_stage(out: &mut String, stage: &StageResult) {
  let _ = writeln!(out, "$ {}", stage.command);
  let exit_label = match (stage.exit_code, stage.timed_out) {
    (_, true) => "timeout".to_string(),
    (Some(code), false) => code.to_string(),
    (None, false) => "?".to_string(),
  };
  let _ = writeln!(out, "exit: {} ({}ms)", exit_label, stage.duration_ms);
  if !stage.stdout.is_empty() {
    out.push_str(stage.stdout.trim_end());
    out.push('\n');
  }
  if !stage.stderr.is_empty() {
    out.push_str(stage.stderr.trim_end());
    out.push('\n');
  }
}
