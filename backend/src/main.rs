mod app_state;
mod config;
mod db;
mod error;
mod models;
mod routes;
mod runtime;

use crate::{app_state::AppState, config::AppConfig, models::RunStatus};
use anyhow::Result;
use axum::Router;
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() -> Result<()> {
  init_tracing();

  let config = AppConfig::from_env()?;
  log_model_config(&config);

  let db = db::init_pool(&config.database_url).await?;
  let initial_runs = db::load_all_runs(&db).await?;
  tracing::info!(count = initial_runs.len(), "loaded runs from database");

  let state = AppState::new(
    config.anthropic_api_key.clone(),
    config.anthropic_model.clone(),
    db,
    initial_runs,
  );

  restore_active_run(&state).await;

  let app = build_router(state);

  let listener = TcpListener::bind(config.bind_addr).await?;
  tracing::info!(address = %config.bind_addr, "backend server listening");

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
  tracing::info!(
      anthropic = "set",
      model = %config.anthropic_model,
      "anthropic configuration loaded"
  );
}

async fn restore_active_run(state: &AppState) {
  let run_to_restore = {
    let runs = state.runs.read().await;
    runs
      .values()
      .filter(|run| {
        matches!(run.status, RunStatus::Queued | RunStatus::Running)
      })
      .max_by(|left, right| left.updated_at.cmp(&right.updated_at))
      .cloned()
  };

  let Some(run) = run_to_restore else {
    return;
  };

  {
    let mut active_run_id = state.active_run_id.write().await;
    *active_run_id = Some(run.id);
  }

  {
    let (sender, _receiver) = broadcast::channel(256);
    let mut streams = state.run_streams.write().await;
    streams.insert(run.id, sender);
  }

  tracing::info!(run_id = %run.id, "restoring active run from database state");
  runtime::spawn_run(state.clone(), run.id, run.kind);
}
