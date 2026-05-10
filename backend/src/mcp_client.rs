//! Singleton MCP client connection to the Playwright sidecar.
//!
//! The handle is consumed in two ways, both from the same connection:
//!
//! - As an agent tool surface. `llm.rs` lists the remote tools via
//!   [`McpHandle::peer`] + `list_all_tools` and registers each one into
//!   the per-turn [`rig::tool::server::ToolServer`] alongside our native
//!   Rust tools, so the agent sees `browser_navigate`, `browser_click`,
//!   `browser_network_requests`, … as first-class tools.
//! - As a direct call channel. [`crate::tools::web_fetch::WebFetchTool`]
//!   bypasses the agent loop and uses [`McpHandle::call_tool`] to drive
//!   `browser_navigate` + `browser_evaluate` itself, since `web_fetch`
//!   wants the raw HTML rather than letting the model decide when the
//!   page is ready.
//!
//! The [`rmcp::service::RunningService`] returned by `connect` must be
//! kept alive for the lifetime of the connection — dropping it tears
//! down the transport. We pin it inside an `Arc` and store the whole
//! handle in [`crate::app_state::AppState`].
//!
//! Connection establishment is non-fatal: if the Playwright container is
//! unreachable at startup, [`connect`] returns a handle with no live
//! service so the rest of the app runs with degraded browser tools
//! ([`McpHandle::call_tool`] returns an error and `peer()` returns
//! `None`, letting `llm.rs` skip MCP tool registration).
//!
//! [`crate::app_state::AppState`]: crate::app_state::AppState

use std::sync::Arc;

use anyhow::{Context, Result};
use rig::tool::rmcp::McpClientHandler;
use rig::tool::server::ToolServer;
use rmcp::model::{
  CallToolRequestParams, CallToolResult, ClientCapabilities, ClientInfo,
  Implementation,
};
use rmcp::service::{Peer, RoleClient, RunningService};
use rmcp::transport::StreamableHttpClientTransport;
use serde_json::Value;

/// Streamable-HTTP endpoint of the Playwright MCP sidecar inside the
/// compose network. The `playwright` service is launched with
/// `--port 8931 --host 0.0.0.0` (see `compose.yaml`), and the MCP path
/// is `/mcp`. Hardcoded because the sidecar is part of our deployment,
/// not a swappable backend.
const PLAYWRIGHT_MCP_URL: &str = "http://playwright:8931/mcp";

/// Shared handle to the Playwright MCP setup.
///
/// When `service` is `None` (sidecar unreachable at startup)
/// [`McpHandle::call_tool`] errors out so internal callers like
/// `web_fetch` can degrade.
///
/// Cheap to clone: every field is `Arc`-shaped already.
#[derive(Clone)]
pub struct McpHandle {
  /// Owns the live MCP transport + service loop when the sidecar is up.
  /// `None` when the connection failed at startup. Dropping the last
  /// clone closes the connection.
  service: Option<Arc<RunningService<RoleClient, McpClientHandler>>>,
}

impl McpHandle {
  /// Peer used to call MCP tools directly (bypassing the agent loop).
  /// `None` when the sidecar was unreachable.
  pub fn peer(&self) -> Option<Peer<RoleClient>> {
    self.service.as_ref().map(|s| s.peer().clone())
  }

  /// Convenience: call an MCP tool by name with a JSON object payload.
  /// Errors if the sidecar is offline.
  pub async fn call_tool(
    &self,
    name: &str,
    arguments: Value,
  ) -> Result<CallToolResult> {
    let peer = self
      .peer()
      .context("Playwright MCP sidecar is not connected")?;
    let mut params = CallToolRequestParams::new(name.to_string());
    match arguments {
      Value::Object(map) => {
        params = params.with_arguments(map);
      }
      Value::Null => {}
      other => {
        anyhow::bail!(
          "MCP tool arguments must be a JSON object or null, got {other:?}"
        );
      }
    }
    peer
      .call_tool(params)
      .await
      .with_context(|| format!("MCP call_tool({name}) failed"))
  }
}

/// Builds an [`McpHandle`] and attempts to connect to the Playwright MCP
/// server at [`PLAYWRIGHT_MCP_URL`]. Always returns a usable handle: a
/// connection failure yields a handle with no live service, so the rest
/// of the app can boot with degraded browser tools instead of refusing
/// to start.
pub async fn connect() -> McpHandle {
  // The McpClientHandler API requires a ToolServerHandle for the
  // server to populate as it announces tools, but we don't consume
  // that handle: agents build their own per-turn ToolServer in
  // `llm.rs` and pull the remote tool list via `peer().list_all_tools()`
  // instead. So this ToolServer exists purely to satisfy the
  // constructor signature and stays internal to the handler.
  let tool_server_handle = ToolServer::new().run();
  let client_info = ClientInfo::new(
    ClientCapabilities::default(),
    Implementation::new("vemium", env!("CARGO_PKG_VERSION")),
  );
  let handler = McpClientHandler::new(client_info, tool_server_handle);
  let transport = StreamableHttpClientTransport::from_uri(PLAYWRIGHT_MCP_URL);

  match handler.connect(transport).await {
    Ok(service) => {
      log_remote_tools(service.peer()).await;
      McpHandle {
        service: Some(Arc::new(service)),
      }
    }
    Err(error) => {
      tracing::error!(
        "failed to connect to Playwright MCP at {PLAYWRIGHT_MCP_URL}: \
         {error:?} (continuing without browser-backed tools)"
      );
      McpHandle { service: None }
    }
  }
}

/// One-shot listing of the remote tool surface, emitted at startup so
/// operators can see which `browser_*` tools the agent will inherit.
/// Failures are downgraded to a warning — the connection is already up
/// and per-turn `list_all_tools` calls in `llm.rs` will retry.
async fn log_remote_tools(peer: &Peer<RoleClient>) {
  match peer.list_all_tools().await {
    Ok(tools) => {
      let count = tools.len();
      let names: Vec<String> =
        tools.iter().map(|t| t.name.to_string()).collect();
      tracing::info!(
        "connected to Playwright MCP at {PLAYWRIGHT_MCP_URL} \
         ({count} tools: {})",
        names.join(", ")
      );
    }
    Err(error) => {
      tracing::warn!(
        "connected to Playwright MCP at {PLAYWRIGHT_MCP_URL} but tool \
         listing failed: {error}"
      );
    }
  }
}
