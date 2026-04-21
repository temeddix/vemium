use axum::{
  Json, Router,
  extract::{
    Path, State,
    ws::{Message, WebSocket, WebSocketUpgrade},
  },
  http::StatusCode,
  response::IntoResponse,
  routing::{get, post},
};
use chrono::Utc;
use serde_json::json;
use tokio::sync::broadcast;
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

use crate::{
  app_state::AppState,
  db,
  models::{
    CreateRunRequest, CreateRunResponse, RunKind, RunRecord, RunStatus,
  },
  runtime,
};

const DEFAULT_INTERVAL_SECONDS: u64 = 0;
const DEFAULT_ROUNDS: u32 = 1;
const MAX_INTERVAL_SECONDS: u64 = 86_400;
const MAX_ROUNDS: u32 = 24;

pub fn create_router(state: AppState) -> Router {
  Router::new()
    .route("/v1/health", get(health_check))
    .route("/v1/runs/discussion", post(create_discussion_run))
    .route("/v1/runs/weekly-report", post(create_weekly_report_run))
    .route("/v1/runs/:run_id", get(get_run))
    .route("/v1/runs/:run_id/stream", get(stream_run_events))
    .fallback_service(
      ServeDir::new("dist")
        .not_found_service(ServeFile::new("dist/index.html")),
    )
    .with_state(state)
}

async fn health_check() -> impl IntoResponse {
  let payload = json!({
      "status": "ok",
      "message": "Vemium backend is healthy."
  });

  (StatusCode::OK, Json(payload))
}

async fn create_discussion_run(
  State(state): State<AppState>,
  payload: Option<Json<CreateRunRequest>>,
) -> impl IntoResponse {
  let request = payload.map(|Json(body)| body).unwrap_or_default();
  create_run(state, RunKind::Discussion, request).await
}

async fn create_weekly_report_run(
  State(state): State<AppState>,
  payload: Option<Json<CreateRunRequest>>,
) -> impl IntoResponse {
  let request = payload.map(|Json(body)| body).unwrap_or_default();
  create_run(state, RunKind::WeeklyReport, request).await
}

async fn create_run(
  state: AppState,
  kind: RunKind,
  request: CreateRunRequest,
) -> impl IntoResponse {
  let run_id = Uuid::new_v4();
  let now = Utc::now().to_rfc3339();
  let topic = request
    .topic
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| "general research".to_string());
  let goal = request
    .goal
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
    .unwrap_or_else(|| default_goal_for_kind(&kind).to_string());
  let background = request
    .background
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());
  let instruction = request
    .instruction
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());
  let interval_seconds = request
    .interval_seconds
    .map(|value| value.min(MAX_INTERVAL_SECONDS))
    .unwrap_or(DEFAULT_INTERVAL_SECONDS);
  let rounds = request
    .rounds
    .map(|value| value.clamp(DEFAULT_ROUNDS, MAX_ROUNDS))
    .unwrap_or(DEFAULT_ROUNDS);

  let record = RunRecord {
    id: run_id,
    kind: kind.clone(),
    status: RunStatus::Queued,
    topic,
    goal,
    instruction,
    background,
    interval_seconds,
    rounds,
    created_at: now.clone(),
    updated_at: now,
  };

  {
    let mut runs = state.runs.write().await;
    runs.insert(run_id, record.clone());
  }

  if let Err(error) = db::insert_run(&state.db, &record).await {
    tracing::warn!(run_id = %run_id, %error, "failed to persist run to database");
  }

  {
    let (sender, _receiver) = broadcast::channel(256);
    let mut streams = state.run_streams.write().await;
    streams.insert(run_id, sender);
  }

  runtime::spawn_run(state, run_id, kind);

  (
    StatusCode::ACCEPTED,
    Json(CreateRunResponse { run: record }),
  )
}

fn default_goal_for_kind(kind: &RunKind) -> &'static str {
  match kind {
    RunKind::Discussion => {
      "Analyze the topic with evidence and produce a balanced recommendation."
    }
    RunKind::WeeklyReport => {
      "Produce a concise weekly report with key developments, risks, and next actions."
    }
  }
}

async fn get_run(
  Path(run_id): Path<Uuid>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  let run = {
    let runs = state.runs.read().await;
    runs.get(&run_id).cloned()
  };

  match run {
    Some(record) => {
      (StatusCode::OK, Json(json!({ "run": record }))).into_response()
    }
    None => (
      StatusCode::NOT_FOUND,
      Json(json!({ "error": "Run not found." })),
    )
      .into_response(),
  }
}

async fn stream_run_events(
  Path(run_id): Path<Uuid>,
  State(state): State<AppState>,
  ws: WebSocketUpgrade,
) -> impl IntoResponse {
  let sender = {
    let streams = state.run_streams.read().await;
    streams.get(&run_id).cloned()
  };

  match sender {
    Some(run_sender) => {
      ws.on_upgrade(move |socket| handle_socket(socket, run_sender.subscribe()))
    }
    None => (
      StatusCode::NOT_FOUND,
      Json(json!({ "error": "Run stream not found." })),
    )
      .into_response(),
  }
}

async fn handle_socket(
  mut socket: WebSocket,
  mut receiver: broadcast::Receiver<crate::models::RunEvent>,
) {
  loop {
    tokio::select! {
        incoming = socket.recv() => {
            match incoming {
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {}
                Some(Err(_)) => break,
            }
        }
        event = receiver.recv() => {
            match event {
                Ok(event) => {
                    let serialized = match serde_json::to_string(&event) {
                        Ok(payload) => payload,
                        Err(_) => continue,
                    };

                    if socket.send(Message::Text(serialized)).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    }
  }
}
