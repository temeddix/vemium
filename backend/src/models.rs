use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
  Queued,
  Running,
  Completed,
  Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
  pub id: Uuid,
  pub status: RunStatus,
  pub topic: String,
  pub goal: String,
  pub instruction: Option<String>,
  pub background: Option<String>,
  pub interval_seconds: u64,
  #[serde(alias = "rounds")]
  pub discussion_cycles: u32,
  pub run_forever: bool,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRunRequest {
  pub topic: Option<String>,
  pub goal: Option<String>,
  pub instruction: Option<String>,
  pub background: Option<String>,
  pub interval_seconds: Option<u64>,
  #[serde(alias = "chatTurns", alias = "rounds")]
  pub discussion_cycles: Option<u32>,
  pub run_forever: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunLaunchSettings {
  pub topic: String,
  pub goal: String,
  pub instruction: String,
  pub background: String,
  #[serde(alias = "chatTurns")]
  pub discussion_cycles: u32,
  #[serde(alias = "scheduleCron")]
  pub room_schedule: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertRunSettingsRequest {
  pub topic: String,
  pub goal: String,
  pub instruction: String,
  pub background: String,
  #[serde(alias = "chatTurns")]
  pub discussion_cycles: u32,
  #[serde(alias = "scheduleCron")]
  pub room_schedule: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEvent {
  pub run_id: Uuid,
  pub sequence: u64,
  pub event_type: String,
  pub agent: Option<String>,
  pub content: String,
  pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateRunResponse {
  pub run: RunRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunSettingsResponse {
  pub settings: Vec<RunLaunchSettings>,
}
