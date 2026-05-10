//! Per-room filesystem workspace.
//!
//! Each room owns a directory at `<data_root>/debate/<room-slug>/`. Inside it
//! lives a Python project: `pyproject.toml`, `.venv/`, a `src/` directory for
//! Python scripts, and a `basket/` directory for other files.
//!
//! [`RoomWorkspace`] is the only public entry point. All filesystem
//! operations it exposes are sandboxed under the room root: callers can
//! only refer to children by relative path, and the resolution helpers
//! reject any path that escapes via `..`, symlinks, or absolute paths.
//!
//! Every directory we create here is chmodded to `0o777` on Unix because
//! the Playwright sidecar shares this volume but runs as `node` (UID
//! 1000).

use anyhow::{Context, Result, anyhow, bail};
use std::io::{BufReader, Cursor};
use std::path::{Component, Path, PathBuf};
use tokio::fs;
use zip::CompressionMethod;
use zip::write::{SimpleFileOptions, ZipWriter};

/// Maximum bytes returned by [`RoomWorkspace::read_file`]. Files larger
/// than this are truncated to keep tool outputs in a sane token budget.
const MAX_READ_BYTES: usize = 64 * 1024;

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
    apply_loose_perms(&path).await;
    Ok(RoomWorkspace { root: path })
  }
}

/// Apply `0o777` perms to `path`. Unix-only; a no-op on other platforms.
/// Logged at debug on failure so a missing capability does not abort the
/// caller (we already own the file, so the only realistic failure is a
/// read-only filesystem).
async fn apply_loose_perms(path: &Path) {
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o777);
    if let Err(error) = fs::set_permissions(path, perms).await {
      tracing::debug!(
        path = %path.display(),
        ?error,
        "failed to apply loose perms",
      );
    }
  }
  #[cfg(not(unix))]
  {
    let _ = path;
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
  pub fn resolve(&self, relative: &Path) -> Result<PathBuf> {
    if relative.is_absolute() {
      bail!("absolute paths are not allowed: {}", relative.display());
    }
    for component in relative.components() {
      match component {
        Component::Normal(_) => {}
        Component::CurDir => {}
        Component::ParentDir => {
          bail!("path escapes the room workspace: {}", relative.display());
        }
        Component::Prefix(_) | Component::RootDir => {
          bail!("absolute paths are not allowed: {}", relative.display());
        }
      }
    }
    Ok(self.root.join(relative))
  }

  /// Lists files in the given relative directory (recursive).
  pub async fn list_files(
    &self,
    relative_dir: &Path,
  ) -> Result<Vec<WorkspaceFile>> {
    let dir = self.resolve(relative_dir)?;
    let mut out = Vec::new();
    walk_files(&self.root, &dir, &mut out).await?;
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(out)
  }

  /// Reads a UTF-8 text file. Returns at most [`MAX_READ_BYTES`] characters
  /// to keep tool outputs from blowing up the model's context window.
  pub async fn read_file(&self, relative: &Path) -> Result<String> {
    let path = self.resolve(relative)?;
    let raw = fs::read(&path)
      .await
      .with_context(|| format!("failed to read {}", path.display()))?;
    let text = String::from_utf8_lossy(&raw).into_owned();
    Ok(truncate_to_chars(&text, MAX_READ_BYTES))
  }

  /// Reads a file as raw bytes, with no size cap. Used by the HTTP layer
  /// when serving workspace artifacts to the browser; binary formats (CSV,
  /// PNG, etc.) must round-trip without UTF-8 mangling.
  pub async fn read_file_raw(&self, relative: &Path) -> Result<Vec<u8>> {
    let path = self.resolve(relative)?;
    fs::read(&path)
      .await
      .with_context(|| format!("failed to read {}", path.display()))
  }

  /// Builds a deflate-compressed zip archive of the entire workspace,
  /// honouring the same dotfile skip rule as [`Self::list_files`] so the
  /// `.venv` and any other hidden state stay out. The walk runs on a
  /// blocking pool so the synchronous `zip` writer does not stall the
  /// runtime.
  pub async fn archive_to_zip(&self) -> Result<Vec<u8>> {
    let entries = self.list_files(Path::new("")).await?;
    let root = self.root.clone();
    let bytes = tokio::task::spawn_blocking(move || -> Result<Vec<u8>> {
      let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
      let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated);
      for entry in entries {
        let absolute = root.join(&entry.relative_path);
        writer
          .start_file(&entry.relative_path, options)
          .with_context(|| {
            format!("failed to start zip entry {}", entry.relative_path)
          })?;
        let file = std::fs::File::open(&absolute)
          .with_context(|| format!("failed to open {}", absolute.display()))?;
        let mut reader = BufReader::new(file);
        std::io::copy(&mut reader, &mut writer).with_context(|| {
          format!("failed to copy {} into zip", absolute.display())
        })?;
      }
      let cursor = writer.finish().context("failed to finalize zip")?;
      Ok(cursor.into_inner())
    })
    .await
    .context("zip writer task panicked")??;
    Ok(bytes)
  }

  /// Writes (or overwrites) a UTF-8 text file, creating any missing parent
  /// directories along the way.
  pub async fn write_file(
    &self,
    relative: &Path,
    contents: &str,
  ) -> Result<()> {
    self.write_file_bytes(relative, contents.as_bytes()).await
  }

  /// Writes (or overwrites) an arbitrary byte buffer. Used by
  /// `download_file` for binary payloads (PDF/XLSX/ZIP) where utf-8
  /// validation is not appropriate.
  pub async fn write_file_bytes(
    &self,
    relative: &Path,
    contents: &[u8],
  ) -> Result<()> {
    let path = self.resolve(relative)?;
    if let Some(parent) = path.parent() {
      ensure_loose_dir_chain(&self.root, parent).await?;
    }
    fs::write(&path, contents)
      .await
      .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
  }

  /// Creates (or truncates) a file under the workspace and returns the
  /// open async handle. Used by `download_file` to stream large HTTP
  /// bodies straight to disk instead of buffering them in memory.
  pub async fn create_file(&self, relative: &Path) -> Result<fs::File> {
    let path = self.resolve(relative)?;
    if let Some(parent) = path.parent() {
      ensure_loose_dir_chain(&self.root, parent).await?;
    }
    fs::File::create(&path)
      .await
      .with_context(|| format!("failed to create {}", path.display()))
  }
}

/// Walks each component from `base` down to `target` (which must be a
/// descendant of `base`), creating any missing directory and chmodding
/// every component to `0o777` so the Playwright sidecar can write inside
/// directories the app made. `base` itself is also chmodded so a workspace
/// root that pre-dates the loose-perms fix gets repaired on first write.
async fn ensure_loose_dir_chain(base: &Path, target: &Path) -> Result<()> {
  let relative = target.strip_prefix(base).with_context(|| {
    format!(
      "internal: {} is not under workspace root {}",
      target.display(),
      base.display(),
    )
  })?;
  let mut current = base.to_path_buf();
  apply_loose_perms(&current).await;
  for component in relative.components() {
    let Component::Normal(name) = component else {
      continue;
    };
    current.push(name);
    match fs::create_dir(&current).await {
      Ok(()) => {}
      Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
      Err(error) => {
        return Err(
          anyhow!(error)
            .context(format!("failed to create {}", current.display())),
        );
      }
    }
    apply_loose_perms(&current).await;
  }
  Ok(())
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
