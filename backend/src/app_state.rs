use crate::models::{RunEvent, RunRecord};
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::{RwLock, broadcast};
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
  pub runs: Arc<RwLock<HashMap<Uuid, RunRecord>>>,
  pub active_run_id: Arc<RwLock<Option<Uuid>>>,
  pub run_streams: Arc<RwLock<HashMap<Uuid, broadcast::Sender<RunEvent>>>>,
  pub cancelled_runs: Arc<RwLock<HashSet<Uuid>>>,
  pub anthropic_api_key: Arc<String>,
  pub anthropic_high_model: Arc<String>,
  pub anthropic_low_model: Arc<String>,
  pub db: SqlitePool,
}

impl AppState {
  pub fn new(
    anthropic_api_key: String,
    anthropic_high_model: String,
    anthropic_low_model: String,
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
      cancelled_runs: Arc::new(RwLock::new(HashSet::new())),
      anthropic_api_key: Arc::new(anthropic_api_key),
      anthropic_high_model: Arc::new(anthropic_high_model),
      anthropic_low_model: Arc::new(anthropic_low_model),
      db,
    }
  }
}
