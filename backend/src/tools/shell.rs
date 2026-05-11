use crate::event_log::{EventLog, RowHandle};
use crate::models::RoomEventKind;
use crate::workspace::RoomWorkspace;
use rig::completion::ToolDefinition;
use rig::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time;

pub const NAME: &str = "run_shell";
const TIMEOUT: Duration = Duration::from_secs(60);
const MAX_CAPTURED_BYTES: usize = 16 * 1024;

#[derive(Clone)]
pub struct RunShellTool {
  workspace: RoomWorkspace,
  log: EventLog,
  author: String,
}

impl RunShellTool {
  pub fn new(workspace: RoomWorkspace, log: EventLog, author: String) -> Self {
    Self {
      workspace,
      log,
      author,
    }
  }
}

#[derive(Debug, Deserialize)]
pub struct RunShellArgs {
  pub command: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunShellOutput {
  pub exit_code: Option<i32>,
  pub stdout: String,
  pub stderr: String,
  pub timed_out: bool,
}

#[derive(Debug, Error)]
#[error("{0}")]
pub struct RunShellError(String);

impl Tool for RunShellTool {
  const NAME: &'static str = NAME;
  type Args = RunShellArgs;
  type Output = RunShellOutput;
  type Error = RunShellError;

  async fn definition(&self, _prompt: String) -> ToolDefinition {
    ToolDefinition {
      name: NAME.to_string(),
      description: "Runs a shell command (`/bin/sh -c`) in the room workspace \
                    directory. Use for simple file operations (`mv`, `cp`, \
                    `ls`, …) that no dedicated tool covers. stdout and stderr \
                    stream into the inline note as the command runs. Times out \
                    after 60 seconds."
        .to_string(),
      parameters: json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "command": {
            "type": "string",
            "description": "Shell command to execute."
          }
        },
        "required": ["command"]
      }),
    }
  }

  async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
    let row = self
      .log
      .start_row(
        RoomEventKind::InlineNote,
        Some(self.author.clone()),
        format!("$ {}", args.command),
        String::new(),
      )
      .await;

    let output = run(&args.command, &self.workspace, &row).await;

    let (label, detail) = match &output {
      Ok(out) => {
        let ok = out.exit_code == Some(0) && !out.timed_out;
        let label = if ok {
          "Ran shell command"
        } else {
          "Failed to run shell command"
        };
        let mut detail = format!("$ {}\n\n", args.command);
        if !out.stdout.is_empty() {
          detail.push_str(&out.stdout);
        }
        if !out.stderr.is_empty() {
          if !detail.is_empty() {
            detail.push('\n');
          }
          detail.push_str(&out.stderr);
        }
        if out.timed_out {
          detail.push_str("\n(timed out)");
        }
        (label.to_string(), detail)
      }
      Err(e) => (
        "Failed to run shell command".to_string(),
        format!("$ {}\n{}", args.command, e.0),
      ),
    };

    row.replace_body(label, detail).await;
    row
      .finish(matches!(&output, Ok(out) if out.exit_code == Some(0) && !out.timed_out))
      .await;

    output
  }
}

async fn run(
  command: &str,
  workspace: &RoomWorkspace,
  row: &RowHandle,
) -> Result<RunShellOutput, RunShellError> {
  let mut child = Command::new("/bin/sh")
    .args(["-c", command])
    .current_dir(&workspace.root)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true)
    .spawn()
    .map_err(|e| RunShellError(format!("failed to spawn shell: {e}")))?;

  let stdout_buf = Arc::new(Mutex::new(Vec::<u8>::new()));
  let stderr_buf = Arc::new(Mutex::new(Vec::<u8>::new()));

  let stdout_task = child
    .stdout
    .take()
    .map(|out| tokio::spawn(forward(out, stdout_buf.clone(), row.clone())));
  let stderr_task = child
    .stderr
    .take()
    .map(|err| tokio::spawn(forward(err, stderr_buf.clone(), row.clone())));

  let timed_out;
  let exit_code;
  match time::timeout(TIMEOUT, child.wait()).await {
    Ok(Ok(status)) => {
      timed_out = false;
      exit_code = status.code();
    }
    Ok(Err(e)) => {
      return Err(RunShellError(format!("wait failed: {e}")));
    }
    Err(_) => {
      timed_out = true;
      exit_code = None;
    }
  }

  if let Some(t) = stdout_task {
    let _ = t.await;
  }
  if let Some(t) = stderr_task {
    let _ = t.await;
  }

  let stdout = decode_buf(&stdout_buf);
  let stderr = decode_buf(&stderr_buf);

  Ok(RunShellOutput {
    exit_code,
    stdout,
    stderr,
    timed_out,
  })
}

async fn forward(
  stream: impl tokio::io::AsyncRead + Unpin + Send + 'static,
  buf: Arc<Mutex<Vec<u8>>>,
  row: RowHandle,
) {
  let mut reader = BufReader::new(stream).lines();
  while let Ok(Some(line)) = reader.next_line().await {
    row.append_detail(&line).await;
    if let Ok(mut locked) = buf.lock()
      && locked.len() < MAX_CAPTURED_BYTES
    {
      locked.extend_from_slice(line.as_bytes());
      locked.push(b'\n');
    }
  }
}

fn decode_buf(buf: &Arc<Mutex<Vec<u8>>>) -> String {
  buf
    .lock()
    .map(|locked| String::from_utf8_lossy(&locked).into_owned())
    .unwrap_or_default()
}
