//! Vemium backend entry point.
//!
//! Boot sequence:
//!
//! 1. Initialize tracing.
//! 2. Build the (compile-time) [`AppConfig`].
//! 3. Open the SQLite pool and run migrations.
//! 4. Build [`AppState`] and reload every persisted room into memory.
//! 5. Start the Axum HTTP server on `bind_addr`.

mod app_state;
mod config;
mod db;
mod error;
mod llm;
mod models;
mod python_runner;
mod routes;
mod runtime;
mod streaming;
mod tools;
mod workspace;

use crate::app_state::AppState;
use crate::config::AppConfig;
use crate::error::ReportError;
use anyhow::Result;
use axum::Router;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() -> Result<()> {
  init_tracing();

  let config = AppConfig::default();
  tracing::info!(
    bind = %config.bind_addr,
    data_root = %config.data_root.display(),
    "loaded backend config",
  );

  ensure_data_root(&config).await;

  let db = db::init_pool(&config.database_url).await?;
  let app_settings = db::load_app_settings(&db).await?;
  let state = AppState::new(db, config.data_root.clone(), app_settings);

  if let Err(error) = runtime::restore_rooms(state.clone()).await {
    tracing::warn!(%error, "failed to restore rooms on startup");
  }

  let app = build_router(state);
  let listener = TcpListener::bind(config.bind_addr).await?;
  tracing::info!(address = %config.bind_addr, "backend server listening");
  axum::serve(listener, app).await?;
  Ok(())
}

fn init_tracing() {
  let filter = tracing_subscriber::EnvFilter::new("info,html5ever=error");
  tracing_subscriber::fmt().with_env_filter(filter).init();
}

fn build_router(state: AppState) -> Router {
  let cors_layer = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods(Any)
    .allow_headers(Any);
  routes::create_router(state).layer(cors_layer)
}

/// Best-effort `mkdir -p` for the data root and the debate sub-directory.
/// Soft failures are logged but do not abort startup, since SQLite's
/// `create_if_missing` will surface a clearer error if the parent really is
/// unwritable.
async fn ensure_data_root(config: &AppConfig) {
  tokio::fs::create_dir_all(&config.data_root)
    .await
    .map_err(anyhow::Error::from)
    .report();
  tokio::fs::create_dir_all(config.data_root.join("debate"))
    .await
    .map_err(anyhow::Error::from)
    .report();
}
