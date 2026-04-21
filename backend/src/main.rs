mod app_state;
mod config;
mod db;
mod models;
mod routes;
mod runtime;

use anyhow::Result;
use axum::Router;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

use crate::{app_state::AppState, config::AppConfig};

#[tokio::main]
async fn main() -> Result<()> {
  init_tracing();

  let config = AppConfig::from_env()?;
  log_model_config(&config);

  let db = db::init_pool(&config.database_url).await?;
  let initial_runs = db::load_all_runs(&db).await?;
  info!(count = initial_runs.len(), "loaded runs from database");

  let state = AppState::new(
    config.anthropic_api_key.clone(),
    config.anthropic_model.clone(),
    db,
    initial_runs,
  );
  let app = build_router(state);

  let listener = TcpListener::bind(config.bind_addr).await?;
  info!(address = %config.bind_addr, "backend server listening");

  axum::serve(listener, app).await?;

  Ok(())
}

fn init_tracing() {
  let filter = tracing_subscriber::EnvFilter::try_from_default_env()
    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

  tracing_subscriber::fmt().with_env_filter(filter).init();
}

fn build_router(state: AppState) -> Router {
  let cors_layer = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods(Any)
    .allow_headers(Any);

  routes::create_router(state).layer(cors_layer)
}

fn log_model_config(config: &AppConfig) {
  info!(
      anthropic = "set",
      model = %config.anthropic_model,
      "anthropic configuration loaded"
  );
}
