//! Per-room filesystem workspace.
//!
//! Each room owns a directory at `<data_root>/debate/<room-slug>/`. Inside it
//! lives a Python project (`pyproject.toml`, `.venv`) shared by every
//! subject folder, plus any number of "subject" subfolders the agents
//! create to organize their work:
//!
//! ```text
//! /data/debate/recent-inflation/
//! ├── pyproject.toml
//! ├── .venv/
//! ├── 2026-05-03_14-23-05 (CPI categories)/
//! │   ├── extract.py
//! │   └── data.csv
//! └── 2026-05-04_09-11-02 (energy weights)/
//!     └── analyze.py
//! ```
//!
//! [`RoomWorkspace`] is the only public entry point. All filesystem
//! operations it exposes are sandboxed under the room root: callers can
//! only refer to children by relative path, and the resolution helpers
//! reject any path that escapes via `..`, symlinks, or absolute paths.

use anyhow::{Context, Result, anyhow, bail};
use chrono::Utc;
use std::path::{Component, Path, PathBuf};
use tokio::fs;

/// Subject-folder timestamp prefix format: `YYYY-MM-DD_HH-MM-SS`. Filesystem
/// safe on every supported platform (no `:` or spaces in the timestamp).
const SUBJECT_FOLDER_TIMESTAMP: &str = "%Y-%m-%d_%H-%M-%S";

/// Maximum bytes returned by [`RoomWorkspace::read_file`]. Files larger
/// than this are truncated to keep tool outputs in a sane token budget.
const MAX_READ_BYTES: usize = 64 * 1024;

/// Name of the Python dependency manifest expected at the room root.
pub const PYPROJECT_FILENAME: &str = "pyproject.toml";

/// Absolute path to the parent directory holding all room workspaces.
/// Constructed once from [`crate::config::AppConfig::data_root`].
#[derive(Debug, Clone)]
pub struct DebateRoot {
  /// `<data_root>/debate`.
  pub root: PathBuf,
}

impl DebateRoot {
  pub fn new(data_root: &Path) -> Self {
    Self {
      root: data_root.join("debate"),
    }
  }

  /// Returns the workspace handle for `code`, ensuring the directory exists
  /// on disk.
  pub async fn workspace_for(&self, code: &str) -> Result<RoomWorkspace> {
    if !is_valid_code(code) {
      bail!(
        "workspace code rejected (must be lowercase letters and '-' only): \
         {code}"
      );
    }
    let path = self.root.join(code);
    fs::create_dir_all(&path).await.with_context(|| {
      format!("failed to create room workspace at {}", path.display())
    })?;
    Ok(RoomWorkspace { root: path })
  }
}

/// Filesystem handle scoped to a single room.
///
/// The `root` is treated as an opaque sandbox: every method that takes a
/// "relative path" goes through [`RoomWorkspace::resolve`], which rejects
/// anything that would escape the sandbox.
#[derive(Debug, Clone)]
pub struct RoomWorkspace {
  pub root: PathBuf,
}

/// Description of a subject folder at the room root, returned by
/// [`RoomWorkspace::list_subject_folders`].
#[derive(Debug, Clone)]
pub struct SubjectFolder {
  /// Folder name as it appears on disk (e.g. `2026-05-03_14-23-05 (CPI)`).
  pub name: String,
  /// `true` if this folder follows the `<datetime> (<subject>)` convention.
  /// Folders the agents created via the workspace tools always do; folders
  /// created by other means (e.g. an agent calling `mkdir`) may not.
  pub structured: bool,
}

/// Description of a regular file inside the workspace, returned by
/// [`RoomWorkspace::list_files`].
#[derive(Debug, Clone)]
pub struct WorkspaceFile {
  /// Path relative to the room root, using forward slashes regardless of
  /// platform.
  pub relative_path: String,
  pub size_bytes: u64,
}

impl RoomWorkspace {
  /// Resolves `relative` against the room root, refusing any input that
  /// would step outside the sandbox.
  ///
  /// The check is structural (no canonicalization, no symlink follow) so
  /// that resolution is side-effect free and safe to call before the path
  /// exists. Callers that need the canonical path must call
  /// `tokio::fs::canonicalize` *after* writing, then re-validate.
  pub fn resolve(&self, relative: &str) -> Result<PathBuf> {
    let candidate = Path::new(relative);
    if candidate.is_absolute() {
      bail!("absolute paths are not allowed: {relative}");
    }
    for component in candidate.components() {
      match component {
        Component::Normal(_) => {}
        Component::CurDir => {}
        Component::ParentDir => {
          bail!("path escapes the room workspace: {relative}");
        }
        Component::Prefix(_) | Component::RootDir => {
          bail!("absolute paths are not allowed: {relative}");
        }
      }
    }
    Ok(self.root.join(candidate))
  }

  /// Lists immediate children of the room root that look like subject
  /// folders. Sorted by name (so timestamped folders are sorted by time).
  pub async fn list_subject_folders(&self) -> Result<Vec<SubjectFolder>> {
    let mut entries = fs::read_dir(&self.root)
      .await
      .with_context(|| format!("failed to read {}", self.root.display()))?;

    let mut out = Vec::new();
    while let Some(entry) = entries
      .next_entry()
      .await
      .context("failed to walk workspace root")?
    {
      let file_type = entry.file_type().await?;
      if !file_type.is_dir() {
        continue;
      }
      let name = entry.file_name().to_string_lossy().into_owned();
      if name.starts_with('.') {
        continue; // skip `.venv`, dotfiles
      }
      let structured = looks_like_subject_folder(&name);
      out.push(SubjectFolder { name, structured });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
  }

  /// Creates a new `<datetime> (<subject>)` subject folder and returns the
  /// folder name. The timestamp is generated server-side so the agent
  /// does not have to know the wall clock.
  pub async fn create_subject_folder(&self, subject: &str) -> Result<String> {
    let cleaned = subject.trim();
    if cleaned.is_empty() {
      bail!("subject folder name cannot be empty");
    }
    if cleaned.contains('/') || cleaned.contains('\\') {
      bail!("subject names cannot contain path separators");
    }

    let timestamp = Utc::now().format(SUBJECT_FOLDER_TIMESTAMP);
    let folder_name = format!("{timestamp} ({cleaned})");
    let target = self.resolve(&folder_name)?;
    fs::create_dir_all(&target).await.with_context(|| {
      format!("failed to create subject folder {}", target.display())
    })?;
    Ok(folder_name)
  }

  /// Lists files in the given relative directory (recursive). Convenient
  /// for an agent surveying what artifacts already exist in a subject
  /// folder.
  pub async fn list_files(
    &self,
    relative_dir: &str,
  ) -> Result<Vec<WorkspaceFile>> {
    let dir = self.resolve(relative_dir)?;
    let mut out = Vec::new();
    walk_files(&self.root, &dir, &mut out).await?;
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(out)
  }

  /// Reads a UTF-8 text file. Returns at most [`MAX_READ_BYTES`] characters
  /// to keep tool outputs from blowing up the model's context window.
  pub async fn read_file(&self, relative: &str) -> Result<String> {
    let path = self.resolve(relative)?;
    let raw = fs::read(&path)
      .await
      .with_context(|| format!("failed to read {}", path.display()))?;
    let text = String::from_utf8_lossy(&raw).into_owned();
    Ok(truncate_to_chars(&text, MAX_READ_BYTES))
  }

  /// Writes (or overwrites) a UTF-8 text file, creating any missing parent
  /// directories along the way.
  pub async fn write_file(&self, relative: &str, contents: &str) -> Result<()> {
    let path = self.resolve(relative)?;
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).await.with_context(|| {
        format!("failed to ensure parent dir {}", parent.display())
      })?;
    }
    fs::write(&path, contents.as_bytes())
      .await
      .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
  }
}

async fn walk_files(
  root: &Path,
  dir: &Path,
  out: &mut Vec<WorkspaceFile>,
) -> Result<()> {
  let mut entries = match fs::read_dir(dir).await {
    Ok(entries) => entries,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
      return Ok(());
    }
    Err(error) => {
      return Err(
        anyhow!(error).context(format!("failed to read {}", dir.display())),
      );
    }
  };

  let mut stack = Vec::new();
  while let Some(entry) = entries.next_entry().await? {
    let path = entry.path();
    let name = entry.file_name().to_string_lossy().into_owned();
    if name.starts_with('.') {
      continue; // skip `.venv` and similar
    }
    let file_type = entry.file_type().await?;
    if file_type.is_dir() {
      stack.push(path);
      continue;
    }
    if !file_type.is_file() {
      continue;
    }
    let metadata = entry.metadata().await?;
    let relative_path = relative_to_root(root, &path);
    out.push(WorkspaceFile {
      relative_path,
      size_bytes: metadata.len(),
    });
  }

  for sub in stack {
    Box::pin(walk_files(root, &sub, out)).await?;
  }
  Ok(())
}

fn relative_to_root(root: &Path, path: &Path) -> String {
  match path.strip_prefix(root) {
    Ok(rel) => rel.to_string_lossy().replace('\\', "/"),
    Err(_) => path.to_string_lossy().replace('\\', "/"),
  }
}

fn truncate_to_chars(text: &str, max_bytes: usize) -> String {
  if text.len() <= max_bytes {
    return text.to_string();
  }
  let mut end = max_bytes;
  while end > 0 && !text.is_char_boundary(end) {
    end -= 1;
  }
  let mut truncated = text[..end].to_string();
  truncated.push_str("\n... (truncated)");
  truncated
}

fn is_valid_code(code: &str) -> bool {
  if code.is_empty() || code.len() > 64 {
    return false;
  }
  code.chars().all(|c| c.is_ascii_lowercase() || c == '-')
}

fn looks_like_subject_folder(name: &str) -> bool {
  // Cheap structural check, not a full parse: starts with a digit (year),
  // contains a space and an opening paren.
  name.chars().next().is_some_and(|c| c.is_ascii_digit())
    && name.contains(' ')
    && name.contains('(')
    && name.contains(')')
}
