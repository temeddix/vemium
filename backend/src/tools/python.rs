//! `run_python` tool: writes a Python script into the room's workspace and
//! runs it through the [`PythonRunner`] pipeline (`ruff format -> ruff check
//! -> ty check -> python`).
//!
//! Important behaviors:
//!
//! - The script lives at `<path>` (workspace-relative) so artifacts produced
//!   by previous tool calls remain accessible.
//! - Lint and type-check failures abort *before* execution. The agent gets
//!   a structured `PythonRunResult` explaining which stage failed and what
//!   each tool reported, so it can fix the code and retry.
//! - The room's `python_timeout_seconds` governs the actual script run
//!   only; lint/type stages have a fixed short cap.
//! - The tool's inline-note row streams every line of stdout / stderr as
//!   the script runs, so a slow script's progress is visible in the
//!   timeline before the final exit code lands.

use crate::event_log::{EventLog, RowHandle};
use crate::models::RoomEventKind;
use crate::python_runner::{
  PythonRunResult, PythonRunner, StageResult, StageSink,
};
use crate::workspace::RoomWorkspace;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fmt::Write as _;
use std::path::PathBuf;
use std::sync::Arc;
use thiserror::Error;

pub const NAME: &str = "run_python";
pub const INLINE_NOTE_SUCCESS: &str = "Python script run success";
pub const INLINE_NOTE_FAIL: &str = "Python script run fail";

#[derive(Clone)]
pub struct RunPythonTool {
  workspace: RoomWorkspace,
  runner: PythonRunner,
  log: EventLog,
  author: String,
}

impl RunPythonTool {
  pub fn new(
    workspace: RoomWorkspace,
    runner: PythonRunner,
    log: EventLog,
    author: String,
  ) -> Self {
    Self {
      workspace,
      runner,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct RunPythonArgs {
  /// Workspace-relative path for the script. Defaults to `src/script.py`.
  #[serde(default = "default_script_name")]
  pub script_name: String,
  /// Source code to write before running.
  pub source: String,
  /// Optional command-line arguments forwarded to the script.
  #[serde(default)]
  pub args: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
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
  "src/script.py".to_string()
}

impl Tool for RunPythonTool {
  const NAME: &'static str = NAME;
  type Args = RunPythonArgs;
  type Output = RunPythonOutput;
  type Error = RunPythonError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Writes a Python script into the room workspace and \
                    executes it. The script runs after passing `ruff \
                    format`, `ruff check`, and `ty check`. If any of those \
                    fail, execution is aborted and the failures are \
                    reported back. Edit `pyproject.toml` (via `write_file` \
                    at the workspace root) to add Python dependencies."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "script_name": {
            "type": "string",
            "description": "Workspace-relative path for the script. Defaults \
              to 'src/script.py'."
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
        "required": ["source"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let relative: PathBuf = PathBuf::from(&args.script_name);
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("Running {}", relative.display()),
        String::new(),
      )
      .await;

    if let Err(error) = self.workspace.write_file(&relative, &args.source).await
    {
      let error = RunPythonError::from_anyhow(error);
      row
        .replace_body(INLINE_NOTE_FAIL.to_string(), error.0.clone())
        .await;
      row.finish(false).await;
      return Err(error);
    }

    let result = match self
      .runner
      .run(&relative, &args.args, Some(stream_sink(&row)))
      .await
    {
      Ok(result) => result,
      Err(error) => {
        let error = RunPythonError::from_anyhow(error);
        row
          .replace_body(INLINE_NOTE_FAIL.to_string(), error.0.clone())
          .await;
        row.finish(false).await;
        return Err(error);
      }
    };

    let label = if result.overall_ok {
      INLINE_NOTE_SUCCESS
    } else {
      INLINE_NOTE_FAIL
    };
    let detail = format_run_detail(&result);
    row.replace_body(label.to_string(), detail).await;
    row.finish(result.overall_ok).await;

    Ok(RunPythonOutput {
      script_path: relative.to_string_lossy().replace('\\', "/"),
      result,
    })
  }
}

/// Builds a [`StageSink`] that appends every captured line to the row's
/// `detail` so the user sees stdout / stderr arrive in real time.
fn stream_sink(row: &RowHandle) -> StageSink {
  let row = row.clone();
  Arc::new(move |line: String| {
    let row = row.clone();
    Box::pin(async move {
      row.append_detail(&line).await;
    })
  })
}

/// Formats the full run pipeline as a single human-readable block: one
/// section per executed stage with its rendered command, exit code,
/// duration, and captured stdout / stderr.
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
