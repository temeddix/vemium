//! Python script execution pipeline.
//!
//! The `run_python` agent tool delegates here. The pipeline is intentionally
//! strict so the LLM is forced into a clean correctness loop:
//!
//! 1. `uv run ruff format <script>` - normalize formatting.
//! 2. `uv run ruff check <script>` - must pass; halts on lint errors.
//! 3. `uv run ty check <script>` - must pass; halts on type errors.
//! 4. `uv run python <script> [args...]` - actually executes the program.
//!
//! Steps 1-3 share a short fixed timeout (they should be near-instant). The
//! per-room `python_timeout_seconds` only governs step 4. Each stage's
//! stdout / stderr are read line-by-line and forwarded to an optional
//! [`StageSink`], so callers (notably the `run_python` tool) can stream
//! the script's output into the room timeline as it happens.

use crate::workspace::{PYPROJECT_FILENAME, RoomWorkspace};
use anyhow::{Context, Result, bail};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;
use tokio::time::Instant;
use tokio::{fs, time};

const LINT_STAGE_TIMEOUT: Duration = Duration::from_secs(60);

/// Maximum captured bytes per stream (stdout / stderr) before truncation.
const MAX_CAPTURED_BYTES: usize = 16 * 1024;

const DEFAULT_PYPROJECT: &str = include_str!("python_workspace_template.toml");

/// Async callback the runner invokes for every stdout / stderr line as a
/// stage executes. Stage labels (e.g. `python`, `ruff format`) are
/// prefixed in the sink so streamed output is self-describing.
pub type StageSink =
  Arc<dyn Fn(String) -> futures::future::BoxFuture<'static, ()> + Send + Sync>;

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

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonRunResult {
  pub stages: Vec<StageResult>,
  pub overall_ok: bool,
  pub failed_at: Option<PythonStage>,
}

#[derive(Debug, Clone)]
pub struct PythonRunner {
  workspace: RoomWorkspace,
  run_timeout: Duration,
}

impl PythonRunner {
  pub fn new(workspace: RoomWorkspace, run_timeout_seconds: u64) -> Self {
    Self {
      workspace,
      run_timeout: Duration::from_secs(run_timeout_seconds.max(1)),
    }
  }

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
  /// exist on disk). When `sink` is `Some`, every captured line is
  /// forwarded as it arrives so the caller can stream stage output into
  /// the room timeline.
  pub async fn run(
    &self,
    script_relative_path: &Path,
    args: &[String],
    sink: Option<StageSink>,
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
        sink.clone(),
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
        sink.clone(),
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
        sink.clone(),
      )
      .await?;
    let ty_ok = ty_stage.passed;
    stages.push(ty_stage);
    if !ty_ok {
      return Ok(finalize(stages, Some(PythonStage::TyCheck)));
    }

    let run_stage = self.run_stage(script_arg, args, sink).await?;
    let run_ok = run_stage.passed;
    stages.push(run_stage);
    let failed_at = if run_ok { None } else { Some(PythonStage::Run) };
    Ok(finalize(stages, failed_at))
  }

  async fn stage(
    &self,
    stage: PythonStage,
    argv: [&str; 5],
    timeout: Duration,
    sink: Option<StageSink>,
  ) -> Result<StageResult> {
    let mut command = Command::new(argv[0]);
    command.args(&argv[1..]);
    self.shape_command(&mut command);
    execute(stage, command, render_command(&argv), timeout, sink).await
  }

  async fn run_stage(
    &self,
    script: &str,
    args: &[String],
    sink: Option<StageSink>,
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
      sink,
    )
    .await
  }

  fn shape_command(&self, command: &mut Command) {
    command
      .current_dir(self.workspace_dir())
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .kill_on_drop(true)
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
  sink: Option<StageSink>,
) -> Result<StageResult> {
  let started = Instant::now();
  let mut child = command
    .spawn()
    .with_context(|| format!("failed to spawn `{}`", stage.label()))?;

  let stdout_buf = Arc::new(Mutex::new(Vec::<u8>::new()));
  let stderr_buf = Arc::new(Mutex::new(Vec::<u8>::new()));

  let stdout_task = child.stdout.take().map(|out| {
    tokio::spawn(forward_stream(
      stage,
      "stdout",
      out,
      stdout_buf.clone(),
      sink.clone(),
    ))
  });
  let stderr_task = child.stderr.take().map(|err| {
    tokio::spawn(forward_stream(
      stage,
      "stderr",
      err,
      stderr_buf.clone(),
      sink.clone(),
    ))
  });

  let wait = child.wait();
  let exit_status = match time::timeout(timeout, wait).await {
    Ok(Ok(status)) => Some(status),
    Ok(Err(error)) => {
      return Err(anyhow::Error::from(error))
        .with_context(|| format!("failed to await `{}`", stage.label()));
    }
    Err(_) => None,
  };

  if let Some(task) = stdout_task {
    let _ = task.await;
  }
  if let Some(task) = stderr_task {
    let _ = task.await;
  }

  let stdout = take_buf(&stdout_buf);
  let stderr = take_buf(&stderr_buf);
  let elapsed = started.elapsed().as_millis() as u64;

  Ok(match exit_status {
    Some(status) => StageResult {
      stage,
      command: rendered,
      stdout,
      stderr,
      exit_code: status.code(),
      duration_ms: elapsed,
      passed: status.success(),
      timed_out: false,
    },
    None => StageResult {
      stage,
      command: rendered,
      stdout,
      stderr: format!(
        "stage `{}` exceeded the {}s timeout and was killed",
        stage.label(),
        timeout.as_secs()
      ),
      exit_code: None,
      duration_ms: elapsed,
      passed: false,
      timed_out: true,
    },
  })
}

async fn forward_stream<R: AsyncRead + Unpin + Send + 'static>(
  stage: PythonStage,
  channel: &'static str,
  reader: R,
  buf: Arc<Mutex<Vec<u8>>>,
  sink: Option<StageSink>,
) {
  let mut lines = BufReader::new(reader).lines();
  while let Ok(Some(line)) = lines.next_line().await {
    {
      let mut guard = buf.lock().unwrap_or_else(|poison| poison.into_inner());
      if guard.len() < MAX_CAPTURED_BYTES {
        guard.extend_from_slice(line.as_bytes());
        guard.push(b'\n');
      }
    }
    if let Some(sink) = sink.as_ref() {
      sink(format!("[{} {}] {}\n", stage.label(), channel, line)).await;
    }
  }
}

fn take_buf(buf: &Arc<Mutex<Vec<u8>>>) -> String {
  let bytes = std::mem::take(
    &mut *buf.lock().unwrap_or_else(|poison| poison.into_inner()),
  );
  if bytes.len() <= MAX_CAPTURED_BYTES {
    return String::from_utf8_lossy(&bytes).into_owned();
  }
  let head = &bytes[..MAX_CAPTURED_BYTES];
  let mut text = String::from_utf8_lossy(head).into_owned();
  text.push_str("\n... (truncated)");
  text
}

fn render_command(parts: &[&str]) -> String {
  parts.join(" ")
}
