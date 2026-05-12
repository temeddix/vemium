//! Global Chrome process and per-room isolated browser sessions.
//!
//! [`BrowserRegistry`] owns one shared `Browser` (one Chrome process for the
//! whole app). Each room gets its own isolated CDP `BrowserContext` so
//! cross-room cookies and storage cannot interfere with each other. Within a
//! room, each agent gets its own [`BrowserHandle`] wrapping a single dedicated
//! tab — agents in the same room share cookies but cannot stomp on each
//! other's navigation state.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result, anyhow};

/// Injected into every new document so `browser_console_messages` can read
/// accumulated logs via `window.__consoleLogs`. The guard prevents
/// double-injection on the same document.
const CONSOLE_INTERCEPTOR: &str = r#"(function () {
  if (window.__consoleLogs) { return; }
  window.__consoleLogs = [];
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      var msg = Array.prototype.slice.call(arguments).map(function (a) {
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
      }).join(' ');
      window.__consoleLogs.push({ level: level, message: msg });
      if (orig) { orig.apply(console, arguments); }
    };
  });
})();"#;
use chromiumoxide::Browser;
use chromiumoxide::Page;
use chromiumoxide::cdp::browser_protocol::browser::BrowserContextId;
use chromiumoxide::cdp::browser_protocol::page::AddScriptToEvaluateOnNewDocumentParams;
use chromiumoxide::cdp::browser_protocol::target::{
  CreateBrowserContextParams, CreateTargetParams,
};
use chromiumoxide_fetcher::{BrowserFetcher, BrowserFetcherOptions};
use futures::StreamExt;
use tokio::sync::RwLock;

/// Registry key identifying one agent's browser tab within a room.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct AgentKey {
  pub room_code: String,
  pub author: String,
}

impl AgentKey {
  pub fn new(room_code: impl Into<String>, author: impl Into<String>) -> Self {
    Self {
      room_code: room_code.into(),
      author: author.into(),
    }
  }
}

/// Handle to one agent's dedicated browser tab within an isolated room context.
///
/// Cheap to clone — all fields are `Arc`-backed or CDP reference types.
#[derive(Clone)]
pub struct BrowserHandle {
  /// This agent's dedicated tab.
  pub page: Page,
}

impl BrowserHandle {
  /// Returns a clone of this agent's dedicated page.
  ///
  /// Kept `async` so existing tool call sites compile without modification.
  pub async fn active_page(&self) -> Result<Page> {
    Ok(self.page.clone())
  }
}

/// Global registry of per-agent [`BrowserHandle`]s backed by a single
/// shared Chrome process.
///
/// Rooms share one CDP `BrowserContext` (for shared cookies/storage within a
/// room). Each agent within a room gets its own dedicated `Page` (tab), so
/// concurrent agents cannot stomp on each other's navigation.
///
/// No lock is held during CDP calls, so concurrent callers make progress
/// independently. Double-checked locking prevents duplicate context/page
/// creation on concurrent first access.
///
/// Cheap to clone — all interior state is `Arc`-backed.
#[derive(Clone)]
pub struct BrowserRegistry {
  browser: Arc<Browser>,
  /// One CDP context per room for cookie/storage sharing within the room.
  room_contexts: Arc<RwLock<HashMap<String, BrowserContextId>>>,
  /// One page handle per [`AgentKey`] (room + agent pair).
  agent_handles: Arc<RwLock<HashMap<AgentKey, BrowserHandle>>>,
}

impl BrowserRegistry {
  /// Launches Chromium (auto-downloading if not cached) and returns the
  /// registry. The CDP handler task is spawned on the Tokio runtime and runs
  /// for the process lifetime.
  pub async fn launch(data_root: &std::path::Path) -> Result<Self> {
    let fetcher_dir = data_root.join("chromium-fetcher");
    tokio::fs::create_dir_all(&fetcher_dir)
      .await
      .context("failed to create chromium-fetcher directory")?;
    let fetcher_opts = BrowserFetcherOptions::builder()
      .with_path(fetcher_dir)
      .build()
      .context("failed to build BrowserFetcherOptions")?;
    let info = BrowserFetcher::new(fetcher_opts)
      .fetch()
      .await
      .context("failed to fetch Chromium")?;
    tracing::info!(
      executable = %info.executable_path.display(),
      "launching Chromium"
    );
    let config = chromiumoxide::browser::BrowserConfigBuilder::default()
      .chrome_executable(info.executable_path)
      .arg("no-sandbox")
      .arg("disable-setuid-sandbox")
      .build()
      .map_err(|e| anyhow!("{e}"))?;

    let (browser, mut handler) = Browser::launch(config)
      .await
      .context("failed to launch Chrome process")?;

    tokio::spawn(async move {
      while let Some(h) = handler.next().await {
        if let Err(e) = h {
          tracing::debug!("browser handler error: {e}");
        }
      }
    });

    tracing::info!("Chrome launched successfully");

    Ok(Self {
      browser: Arc::new(browser),
      room_contexts: Arc::new(RwLock::new(HashMap::new())),
      agent_handles: Arc::new(RwLock::new(HashMap::new())),
    })
  }

  /// Returns the agent's handle, creating the room's browser context (if new)
  /// and a dedicated page for the agent (if new). Persists across turns.
  pub async fn get_or_create(&self, key: &AgentKey) -> Result<BrowserHandle> {
    {
      let map = self.agent_handles.read().await;
      if let Some(handle) = map.get(key) {
        return Ok(handle.clone());
      }
    }
    let context_id = self.get_or_create_context(&key.room_code).await?;
    let handle = create_handle(&self.browser, context_id, &key.author).await?;
    let mut map = self.agent_handles.write().await;
    if let Some(existing) = map.get(key) {
      // Another concurrent call won the race — close the redundant page.
      let _ = handle.page.close().await;
      return Ok(existing.clone());
    }
    map.insert(key.clone(), handle.clone());
    Ok(handle)
  }

  /// Removes and disposes the room's browser context and all agent handles
  /// for that room. Idempotent.
  pub async fn forget(&self, room_code: &str) {
    {
      let mut map = self.agent_handles.write().await;
      map.retain(|k, _| k.room_code != room_code);
    }
    let context_id = {
      let mut contexts = self.room_contexts.write().await;
      contexts.remove(room_code)
    };
    if let Some(id) = context_id
      && let Err(e) = self.browser.dispose_browser_context(id).await
    {
      tracing::warn!(
        room_code,
        "failed to dispose browser context on room forget: {e}"
      );
    }
  }

  async fn get_or_create_context(
    &self,
    room_code: &str,
  ) -> Result<BrowserContextId> {
    {
      let contexts = self.room_contexts.read().await;
      if let Some(id) = contexts.get(room_code) {
        return Ok(id.clone());
      }
    }
    let context_id = self
      .browser
      .create_browser_context(CreateBrowserContextParams::default())
      .await
      .with_context(|| {
        format!("failed to create browser context for room {room_code}")
      })?;
    let mut contexts = self.room_contexts.write().await;
    if let Some(existing) = contexts.get(room_code) {
      // Another concurrent call created the context first — dispose ours.
      let _ = self.browser.dispose_browser_context(context_id).await;
      return Ok(existing.clone());
    }
    tracing::info!(room_code, "created isolated browser context");
    contexts.insert(room_code.to_string(), context_id.clone());
    Ok(context_id)
  }
}

// -- Internal helpers -------------------------------------------------------

async fn create_handle(
  browser: &Arc<Browser>,
  context_id: BrowserContextId,
  author: &str,
) -> Result<BrowserHandle> {
  let page = browser
    .new_page(
      CreateTargetParams::builder()
        .url("about:blank")
        .browser_context_id(context_id.clone())
        .build()
        .map_err(|e| anyhow!("{e}"))?,
    )
    .await
    .with_context(|| {
      format!("failed to open initial page for agent {author}")
    })?;

  // Register the console interceptor for all future navigations in this context.
  page
    .execute(AddScriptToEvaluateOnNewDocumentParams {
      source: CONSOLE_INTERCEPTOR.to_string(),
      world_name: None,
      include_command_line_api: None,
      run_immediately: None,
    })
    .await
    .with_context(|| {
      format!("failed to register console interceptor for agent {author}")
    })?;

  // Also inject into the current blank page.
  page.evaluate(CONSOLE_INTERCEPTOR).await.with_context(|| {
    format!("failed to inject console interceptor for agent {author}")
  })?;

  tracing::info!(author, "created browser tab for agent");

  Ok(BrowserHandle { page })
}
