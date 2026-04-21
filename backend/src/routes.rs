use crate::app_state::AppState;
use crate::error::ReportError;
use crate::models::{
  CreateRunRequest, CreateRunResponse, RunRecord, RunSettingsResponse,
  RunStatus, UpsertRunSettingsRequest,
};
use crate::{db, runtime};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde_json::json;
use tokio::sync::broadcast;
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

const DEFAULT_INTERVAL_SECONDS: u64 = 0;
const DEFAULT_AUTORUN_INTERVAL_SECONDS: u64 = 60;
const DEFAULT_ROUNDS: u32 = 1;
const MAX_INTERVAL_SECONDS: u64 = 86_400;
const MAX_ROUNDS: u32 = 24;

pub fn create_router(state: AppState) -> Router {
  Router::new()
    .route("/v1/health", get(health_check))
    .route("/v1/runs/active", get(get_active_run))
    .route("/v1/runs", get(list_runs))
    .route("/v1/settings", get(get_settings))
    .route("/v1/settings/discussion", post(upsert_discussion_settings))
    .route("/v1/runs/discussion", post(create_discussion_run))
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
  create_run(state, request).await
}

async fn create_run(
  state: AppState,
  request: CreateRunRequest,
) -> impl IntoResponse {
  if let Some(active_run) = get_current_active_run(&state).await {
    return (StatusCode::OK, Json(CreateRunResponse { run: active_run }))
      .into_response();
  }

  let saved_settings =
    db::load_settings(&state.db).await.report().flatten();

  let run_id = Uuid::new_v4();
  let now = Utc::now().to_rfc3339();
  let topic = request
    .topic
    .or_else(|| saved_settings.as_ref().map(|s| s.topic.clone()))
    .map(|v| v.trim().to_string())
    .filter(|v| !v.is_empty())
    .unwrap_or_else(|| "general research".to_string());
  let goal = request
    .goal
    .or_else(|| saved_settings.as_ref().map(|s| s.goal.clone()))
    .map(|v| v.trim().to_string())
    .filter(|v| !v.is_empty())
    .unwrap_or_else(|| {
      "Analyze the topic with evidence and produce a balanced recommendation."
        .to_string()
    });
  let background = request
    .background
    .or_else(|| saved_settings.as_ref().map(|s| s.background.clone()))
    .map(|v| v.trim().to_string())
    .filter(|v| !v.is_empty());
  let instruction = request
    .instruction
    .or_else(|| saved_settings.as_ref().map(|s| s.instruction.clone()))
    .map(|v| v.trim().to_string())
    .filter(|v| !v.is_empty());
  let run_forever = request
    .run_forever
    .or_else(|| saved_settings.as_ref().map(|s| s.autorun))
    .unwrap_or(false);
  let interval_seconds = request
    .interval_seconds
    .or_else(|| {
      saved_settings
        .as_ref()
        .map(|s| u64::from(s.interval_minutes) * 60)
    })
    .map(|v| v.min(MAX_INTERVAL_SECONDS))
    .unwrap_or(DEFAULT_INTERVAL_SECONDS);
  let interval_seconds = if run_forever && interval_seconds == 0 {
    DEFAULT_AUTORUN_INTERVAL_SECONDS
  } else {
    interval_seconds
  };
  let rounds = request
    .rounds
    .or_else(|| saved_settings.as_ref().map(|s| s.turns))
    .map(|v| v.clamp(DEFAULT_ROUNDS, MAX_ROUNDS))
    .unwrap_or(DEFAULT_ROUNDS);

  let record = RunRecord {
    id: run_id,
    status: RunStatus::Queued,
    topic,
    goal,
    instruction,
    background,
    interval_seconds,
    rounds,
    run_forever,
    created_at: now.clone(),
    updated_at: now,
  };

  {
    let mut runs = state.runs.write().await;
    runs.insert(run_id, record.clone());
  }

  {
    let mut active_run_id = state.active_run_id.write().await;
    *active_run_id = Some(run_id);
  }

  if let Err(error) = db::insert_run(&state.db, &record).await {
    tracing::warn!(run_id = %run_id, %error, "failed to persist run to database");
  }

  {
    let (sender, _receiver) = broadcast::channel(256);
    let mut streams = state.run_streams.write().await;
    streams.insert(run_id, sender);
  }

  runtime::spawn_run(state, run_id);

  (
    StatusCode::ACCEPTED,
    Json(CreateRunResponse { run: record }),
  )
    .into_response()
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

async fn get_active_run(State(state): State<AppState>) -> impl IntoResponse {
  let run = get_current_active_run(&state).await;
  (StatusCode::OK, Json(json!({ "run": run })))
}

async fn list_runs(State(state): State<AppState>) -> impl IntoResponse {
  let mut runs = {
    let values = state.runs.read().await;
    values.values().cloned().collect::<Vec<_>>()
  };

  runs.sort_by(|left, right| right.created_at.cmp(&left.created_at));

  (StatusCode::OK, Json(json!({ "runs": runs })))
}

async fn get_settings(State(state): State<AppState>) -> impl IntoResponse {
  match db::load_all_settings(&state.db).await {
    Ok(settings) => {
      (StatusCode::OK, Json(RunSettingsResponse { settings })).into_response()
    }
    Err(_) => (
      StatusCode::INTERNAL_SERVER_ERROR,
      Json(json!({ "error": "Failed to load settings." })),
    )
      .into_response(),
  }
}

async fn upsert_discussion_settings(
  State(state): State<AppState>,
  Json(payload): Json<UpsertRunSettingsRequest>,
) -> impl IntoResponse {
  let now = Utc::now().to_rfc3339();
  match db::upsert_settings(&state.db, &payload, &now)
    .await
  {
    Ok(setting) => {
      (StatusCode::OK, Json(json!({ "setting": setting }))).into_response()
    }
    Err(_) => (
      StatusCode::INTERNAL_SERVER_ERROR,
      Json(json!({ "error": "Failed to save settings." })),
    )
      .into_response(),
  }
}

async fn stream_run_events(
  Path(run_id): Path<Uuid>,
  State(state): State<AppState>,
  ws: WebSocketUpgrade,
) -> impl IntoResponse {
  let history = db::load_run_events(&state.db, run_id)
    .await
    .unwrap_or_default();

  let sender = {
    let streams = state.run_streams.read().await;
    streams.get(&run_id).cloned()
  };

  match sender {
    Some(run_sender) => ws.on_upgrade(move |socket| {
      handle_socket(socket, run_sender.subscribe(), history)
    }),
    None if !history.is_empty() => {
      let (_sender, receiver) = broadcast::channel(1);
      ws.on_upgrade(move |socket| handle_socket(socket, receiver, history))
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
  history: Vec<crate::models::RunEvent>,
) {
  for event in history {
    let serialized = match serde_json::to_string(&event) {
      Ok(payload) => payload,
      Err(_) => continue,
    };

    if socket.send(Message::Text(serialized)).await.is_err() {
      return;
    }
  }

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

async fn get_current_active_run(state: &AppState) -> Option<RunRecord> {
  let active_run_id = {
    let active = state.active_run_id.read().await;
    *active
  }?;

  let run = {
    let runs = state.runs.read().await;
    runs.get(&active_run_id).cloned()
  };

  match run {
    Some(record)
      if matches!(record.status, RunStatus::Queued | RunStatus::Running) =>
    {
      Some(record)
    }
    _ => {
      let mut active = state.active_run_id.write().await;
      *active = None;
      None
    }
  }
}
