use std::{collections::HashMap, sync::Arc};

use sqlx::SqlitePool;
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

use crate::models::{RunEvent, RunRecord};

#[derive(Clone)]
pub struct AppState {
  pub runs: Arc<RwLock<HashMap<Uuid, RunRecord>>>,
  pub active_run_id: Arc<RwLock<Option<Uuid>>>,
  pub run_streams: Arc<RwLock<HashMap<Uuid, broadcast::Sender<RunEvent>>>>,
  pub anthropic_api_key: Arc<String>,
  pub anthropic_model: Arc<String>,
  pub db: SqlitePool,
}

impl AppState {
  pub fn new(
    anthropic_api_key: String,
    anthropic_model: String,
    db: SqlitePool,
    initial_runs: Vec<RunRecord>,
  ) -> Self {
    let active_run_id = initial_runs
      .iter()
      .filter(|run| {
        matches!(
          run.status,
          crate::models::RunStatus::Queued | crate::models::RunStatus::Running
        )
      })
      .max_by(|left, right| left.updated_at.cmp(&right.updated_at))
      .map(|run| run.id);

    let runs_map = initial_runs
      .into_iter()
      .map(|run| (run.id, run))
      .collect::<HashMap<_, _>>();

    Self {
      runs: Arc::new(RwLock::new(runs_map)),
      active_run_id: Arc::new(RwLock::new(active_run_id)),
      run_streams: Arc::new(RwLock::new(HashMap::new())),
      anthropic_api_key: Arc::new(anthropic_api_key),
      anthropic_model: Arc::new(anthropic_model),
      db,
    }
  }
}
