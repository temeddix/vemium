//! Python script execution pipeline.
//!
//! The `run_python` agent tool delegates here. The pipeline is intentionally
//! strict so the LLM is forced into a clean correctness loop:
//!
//! 1. `uv run ruff format <script>` — normalize formatting.
//! 2. `uv run ruff check <script>` — must pass; halts on lint errors.
//! 3. `uv run ty check <script>` — must pass; halts on type errors.
//! 4. `uv run python <script> [args...]` — actually executes the program.
//!
//! Steps 1–3 share a short fixed timeout (they should be near-instant). The
//! per-room `python_timeout_seconds` only governs step 4. If any earlier
//! step fails, subsequent steps are skipped and the failure is returned to
//! the agent, which is expected to either fix the code, suppress with
//! `# type: ignore`, or extend `tool.ruff` / `tool.ty` config in
//! `pyproject.toml` (only when truly necessary).

use crate::workspace::{PYPROJECT_FILENAME, RoomWorkspace};
use anyhow::{Context, Result, bail};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::Instant;
use tokio::{fs, time};

/// Hard timeout for `ruff format`, `ruff check`, `ty check`. These run on a
/// single file and should never take this long; the cap is here to avoid
/// the orchestrator hanging on a hung subprocess.
const LINT_STAGE_TIMEOUT: Duration = Duration::from_secs(60);

/// Maximum captured bytes per stream (stdout / stderr) before truncation.
const MAX_CAPTURED_BYTES: usize = 16 * 1024;

/// Minimal `pyproject.toml` written when a room workspace doesn't have one
/// yet. Agents may freely edit this to add dependencies.
const DEFAULT_PYPROJECT: &str = include_str!("python_workspace_template.toml");

/// Stages of the [`PythonRunner::run`] pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PythonStage {
  RuffFormat,
  RuffCheck,
  TyCheck,
  Run,
}

impl PythonStage {
  pub fn label(self) -> &'static str {
    match self {
      Self::RuffFormat => "ruff format",
      Self::RuffCheck => "ruff check",
      Self::TyCheck => "ty check",
      Self::Run => "python",
    }
  }
}

/// Outcome of one stage.
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageResult {
  pub stage: PythonStage,
  pub command: String,
  pub stdout: String,
  pub stderr: String,
  pub exit_code: Option<i32>,
  pub duration_ms: u64,
  pub passed: bool,
  pub timed_out: bool,
}

/// Aggregated outcome of [`PythonRunner::run`]. `overall_ok` is `true` only
/// when every executed stage passed.
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonRunResult {
  pub stages: Vec<StageResult>,
  pub overall_ok: bool,
  /// Stage that aborted the pipeline, if any.
  pub failed_at: Option<PythonStage>,
}

/// Per-room handle responsible for running scripts inside the room's
/// workspace directory. Cheap to construct — does no I/O until [`run`] is
/// called.
#[derive(Debug, Clone)]
pub struct PythonRunner {
  workspace: RoomWorkspace,
  /// Wall-clock cap for the script-execution stage only.
  run_timeout: Duration,
}

impl PythonRunner {
  pub fn new(workspace: RoomWorkspace, run_timeout_seconds: u64) -> Self {
    Self {
      workspace,
      run_timeout: Duration::from_secs(run_timeout_seconds.max(1)),
    }
  }

  /// Ensures the room workspace has a `pyproject.toml`. If one already
  /// exists (the agent may have edited it to add dependencies), it is left
  /// untouched.
  pub async fn ensure_pyproject(&self) -> Result<()> {
    let pyproject = self.workspace.root.join(PYPROJECT_FILENAME);
    if fs::try_exists(&pyproject)
      .await
      .context("failed to probe pyproject.toml")?
    {
      return Ok(());
    }
    fs::write(&pyproject, DEFAULT_PYPROJECT)
      .await
      .with_context(|| format!("failed to write {}", pyproject.display()))?;
    Ok(())
  }

  /// Runs the full pipeline against `script_relative_path` (must already
  /// exist on disk inside the workspace). `args` is forwarded to the
  /// script unchanged.
  pub async fn run(
    &self,
    script_relative_path: &Path,
    args: &[String],
  ) -> Result<PythonRunResult> {
    let absolute = self.workspace.resolve(script_relative_path)?;
    if !fs::try_exists(&absolute)
      .await
      .context("failed to probe script path")?
    {
      bail!("script not found: {}", script_relative_path.display());
    }
    let script_arg = script_relative_path
      .to_str()
      .context("script path is not valid UTF-8")?;
    self.ensure_pyproject().await?;

    let mut stages = Vec::new();

    let format_stage = self
      .stage(
        PythonStage::RuffFormat,
        ["uv", "run", "ruff", "format", script_arg],
        LINT_STAGE_TIMEOUT,
      )
      .await?;
    let format_ok = format_stage.passed;
    stages.push(format_stage);
    if !format_ok {
      return Ok(finalize(stages, Some(PythonStage::RuffFormat)));
    }

    let check_stage = self
      .stage(
        PythonStage::RuffCheck,
        ["uv", "run", "ruff", "check", script_arg],
        LINT_STAGE_TIMEOUT,
      )
      .await?;
    let check_ok = check_stage.passed;
    stages.push(check_stage);
    if !check_ok {
      return Ok(finalize(stages, Some(PythonStage::RuffCheck)));
    }

    let ty_stage = self
      .stage(
        PythonStage::TyCheck,
        ["uv", "run", "ty", "check", script_arg],
        LINT_STAGE_TIMEOUT,
      )
      .await?;
    let ty_ok = ty_stage.passed;
    stages.push(ty_stage);
    if !ty_ok {
      return Ok(finalize(stages, Some(PythonStage::TyCheck)));
    }

    let run_stage = self.run_stage(script_arg, args).await?;
    let run_ok = run_stage.passed;
    stages.push(run_stage);
    let failed_at = if run_ok { None } else { Some(PythonStage::Run) };
    Ok(finalize(stages, failed_at))
  }

  /// Helper for the linter / type-checker stages.
  async fn stage(
    &self,
    stage: PythonStage,
    argv: [&str; 5],
    timeout: Duration,
  ) -> Result<StageResult> {
    let mut command = Command::new(argv[0]);
    command.args(&argv[1..]);
    self.shape_command(&mut command);
    execute(stage, command, render_command(&argv), timeout).await
  }

  /// Helper for the script-execution stage with the room's run timeout.
  async fn run_stage(
    &self,
    script: &str,
    args: &[String],
  ) -> Result<StageResult> {
    let mut argv: Vec<&str> = vec!["uv", "run", "python", script];
    for arg in args {
      argv.push(arg.as_str());
    }
    let mut command = Command::new(argv[0]);
    command.args(&argv[1..]);
    self.shape_command(&mut command);
    execute(
      PythonStage::Run,
      command,
      render_command(&argv),
      self.run_timeout,
    )
    .await
  }

  /// Common subprocess shaping: working directory, stdio, environment.
  fn shape_command(&self, command: &mut Command) {
    command
      .current_dir(self.workspace_dir())
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .kill_on_drop(true)
      // `uv` writes its cache and venv into the project dir; ensure HOME
      // does not leak into a shared writeable cache.
      .env("PYTHONUNBUFFERED", "1");
  }

  fn workspace_dir(&self) -> PathBuf {
    self.workspace.root.clone()
  }
}

fn finalize(
  stages: Vec<StageResult>,
  failed_at: Option<PythonStage>,
) -> PythonRunResult {
  let overall_ok = failed_at.is_none() && stages.iter().all(|s| s.passed);
  PythonRunResult {
    stages,
    overall_ok,
    failed_at,
  }
}

async fn execute(
  stage: PythonStage,
  mut command: Command,
  rendered: String,
  timeout: Duration,
) -> Result<StageResult> {
  let started = Instant::now();
  let child = command
    .spawn()
    .with_context(|| format!("failed to spawn `{}`", stage.label()))?;
  let wait = child.wait_with_output();

  match time::timeout(timeout, wait).await {
    Ok(Ok(output)) => Ok(StageResult {
      stage,
      command: rendered,
      stdout: truncate_bytes(&output.stdout),
      stderr: truncate_bytes(&output.stderr),
      exit_code: output.status.code(),
      duration_ms: started.elapsed().as_millis() as u64,
      passed: output.status.success(),
      timed_out: false,
    }),
    Ok(Err(error)) => {
      Err(error).with_context(|| format!("failed to await `{}`", stage.label()))
    }
    Err(_) => Ok(StageResult {
      stage,
      command: rendered,
      stdout: String::new(),
      stderr: format!(
        "stage `{}` exceeded the {}s timeout and was killed",
        stage.label(),
        timeout.as_secs()
      ),
      exit_code: None,
      duration_ms: started.elapsed().as_millis() as u64,
      passed: false,
      timed_out: true,
    }),
  }
}

fn render_command(parts: &[&str]) -> String {
  parts.join(" ")
}

fn truncate_bytes(bytes: &[u8]) -> String {
  if bytes.len() <= MAX_CAPTURED_BYTES {
    return String::from_utf8_lossy(bytes).into_owned();
  }
  let head = &bytes[..MAX_CAPTURED_BYTES];
  let mut text = String::from_utf8_lossy(head).into_owned();
  text.push_str("\n... (truncated)");
  text
}
