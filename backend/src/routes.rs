//! HTTP and WebSocket routes.
//!
//! Handlers are intentionally thin: they validate input, call into
//! [`crate::db`] / [`crate::runtime`], and shape JSON responses. All
//! orchestration logic lives in [`crate::runtime`].
//!
//! The API surface is room-centric:
//!
//! ```text
//! GET    /v1/health
//! GET    /v1/rooms
//! POST   /v1/rooms
//! GET    /v1/rooms/:id
//! PATCH  /v1/rooms/:id
//! DELETE /v1/rooms/:id
//! POST   /v1/rooms/:id/pause
//! POST   /v1/rooms/:id/resume
//! GET    /v1/rooms/:id/reports
//! GET    /v1/rooms/:id/reports/:seq
//! GET    /v1/rooms/:id/stream    (WebSocket)
//! ```

use crate::app_state::AppState;
use crate::config::room_defaults;
use crate::db;
use crate::error::ReportError;
use crate::models::{
  CreateRoomRequest, ProviderConfig, Room, RoomStatus, UpdateRoomRequest,
};
use crate::runtime;
use crate::streaming::WsEvent;
use anyhow::Result;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde_json::json;
use slug::slugify;
use tokio::sync::broadcast;
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

const SLUG_MAX_ATTEMPTS: u8 = 64;

pub fn create_router(state: AppState) -> Router {
  Router::new()
    .route("/v1/health", get(health_check))
    .route("/v1/rooms", get(list_rooms).post(create_room))
    .route(
      "/v1/rooms/:room_id",
      get(get_room).patch(update_room).delete(delete_room),
    )
    .route("/v1/rooms/:room_id/pause", post(pause_room))
    .route("/v1/rooms/:room_id/resume", post(resume_room))
    .route("/v1/rooms/:room_id/reports", get(list_reports))
    .route("/v1/rooms/:room_id/reports/:sequence", get(get_report))
    .route("/v1/rooms/:room_id/stream", get(stream_room_events))
    .fallback_service(
      ServeDir::new("dist")
        .not_found_service(ServeFile::new("dist/index.html")),
    )
    .with_state(state)
}

// -- Handlers --------------------------------------------------------------

async fn health_check() -> impl IntoResponse {
  (StatusCode::OK, Json(json!({"status": "ok"})))
}

async fn list_rooms(State(state): State<AppState>) -> impl IntoResponse {
  let rooms = state.rooms.read().await;
  let mut views: Vec<_> = rooms.values().map(Room::view).collect();
  views.sort_by_key(|view| std::cmp::Reverse(view.created_at));
  (StatusCode::OK, Json(json!({"rooms": views})))
}

async fn create_room(
  State(state): State<AppState>,
  Json(payload): Json<CreateRoomRequest>,
) -> impl IntoResponse {
  if let Err(error) = validate_provider_config(&payload.low) {
    return bad_request("low", &error);
  }
  if let Err(error) = validate_provider_config(&payload.high) {
    return bad_request("high", &error);
  }

  let name = payload.name.trim();
  if name.is_empty() {
    return bad_request("name", "must not be empty");
  }

  let slug = match unique_slug(&state, name, None).await {
    Ok(value) => value,
    Err(error) => {
      tracing::warn!(%error, "failed to allocate slug");
      return internal("could not allocate slug");
    }
  };

  let now = Utc::now();
  let room = Room {
    id: Uuid::new_v4(),
    name: name.to_string(),
    slug,
    topic: payload.topic.trim().to_string(),
    goal: payload.goal.trim().to_string(),
    instruction: payload
      .instruction
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty()),
    background: payload
      .background
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty()),
    status: RoomStatus::Active,
    chat_interval_seconds: payload
      .chat_interval_seconds
      .unwrap_or(room_defaults::CHAT_INTERVAL_SECONDS),
    evaluation_interval_seconds: payload
      .evaluation_interval_seconds
      .unwrap_or(room_defaults::EVALUATION_INTERVAL_SECONDS),
    report_interval_seconds: payload
      .report_interval_seconds
      .unwrap_or(room_defaults::REPORT_INTERVAL_SECONDS),
    python_timeout_seconds: payload
      .python_timeout_seconds
      .unwrap_or(room_defaults::PYTHON_TIMEOUT_SECONDS),
    python_feedback_every: payload
      .python_feedback_every
      .unwrap_or(room_defaults::PYTHON_FEEDBACK_EVERY),
    low: payload.low,
    high: payload.high,
    created_at: now,
    updated_at: now,
  };

  if let Err(error) = db::insert_room(&state.db, &room).await {
    tracing::warn!(%error, "failed to insert room");
    return internal("failed to persist room");
  }

  if let Err(error) = runtime::spawn_room(state.clone(), room.clone()).await {
    tracing::warn!(%error, "failed to spawn room runtime");
    return internal("room created but failed to start runtime");
  }

  let view = room.view();
  (StatusCode::CREATED, Json(json!({"room": view}))).into_response()
}

async fn get_room(
  Path(room_id): Path<Uuid>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  let rooms = state.rooms.read().await;
  match rooms.get(&room_id) {
    Some(room) => {
      (StatusCode::OK, Json(json!({"room": room.view()}))).into_response()
    }
    None => not_found("room"),
  }
}

async fn update_room(
  Path(room_id): Path<Uuid>,
  State(state): State<AppState>,
  Json(payload): Json<UpdateRoomRequest>,
) -> impl IntoResponse {
  let mut updated = {
    let rooms = state.rooms.read().await;
    match rooms.get(&room_id) {
      Some(room) => room.clone(),
      None => return not_found("room"),
    }
  };

  if let Some(value) = payload.low.as_ref()
    && let Err(error) = validate_provider_config(value)
  {
    return bad_request("low", &error);
  }
  if let Some(value) = payload.high.as_ref()
    && let Err(error) = validate_provider_config(value)
  {
    return bad_request("high", &error);
  }

  if let Some(value) = payload.name {
    let trimmed = value.trim();
    if trimmed.is_empty() {
      return bad_request("name", "must not be empty");
    }
    if trimmed != updated.name {
      updated.name = trimmed.to_string();
      match unique_slug(&state, trimmed, Some(room_id)).await {
        Ok(slug) => updated.slug = slug,
        Err(error) => {
          tracing::warn!(%error, "failed to allocate slug");
          return internal("could not allocate slug");
        }
      }
    }
  }
  if let Some(value) = payload.topic {
    updated.topic = value.trim().to_string();
  }
  if let Some(value) = payload.goal {
    updated.goal = value.trim().to_string();
  }
  if let Some(value) = payload.instruction {
    updated.instruction = value
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty());
  }
  if let Some(value) = payload.background {
    updated.background = value
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty());
  }
  if let Some(value) = payload.chat_interval_seconds {
    updated.chat_interval_seconds = value;
  }
  if let Some(value) = payload.evaluation_interval_seconds {
    updated.evaluation_interval_seconds = value;
  }
  if let Some(value) = payload.report_interval_seconds {
    updated.report_interval_seconds = value;
  }
  if let Some(value) = payload.python_timeout_seconds {
    updated.python_timeout_seconds = value;
  }
  if let Some(value) = payload.python_feedback_every {
    updated.python_feedback_every = value;
  }
  if let Some(value) = payload.low {
    updated.low = value;
  }
  if let Some(value) = payload.high {
    updated.high = value;
  }
  updated.updated_at = Utc::now();

  if let Err(error) = db::update_room(&state.db, &updated).await {
    tracing::warn!(%error, "failed to update room");
    return internal("failed to persist room update");
  }

  {
    let mut rooms = state.rooms.write().await;
    rooms.insert(room_id, updated.clone());
  }

  (StatusCode::OK, Json(json!({"room": updated.view()}))).into_response()
}

async fn delete_room(
  Path(room_id): Path<Uuid>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  let handle = {
    let handles = state.room_handles.read().await;
    handles.get(&room_id).cloned()
  };
  if let Some(handle) = handle {
    handle.request_stop();
  }
  if let Err(error) = db::delete_room(&state.db, room_id).await {
    tracing::warn!(%error, "failed to delete room from db");
    return internal("failed to delete room");
  }
  state.forget_room(room_id).await;
  (StatusCode::NO_CONTENT, Json(json!({}))).into_response()
}

async fn pause_room(
  Path(room_id): Path<Uuid>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  set_room_status(state, room_id, RoomStatus::Paused).await
}

async fn resume_room(
  Path(room_id): Path<Uuid>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  set_room_status(state, room_id, RoomStatus::Active).await
}

async fn set_room_status(
  state: AppState,
  room_id: Uuid,
  status: RoomStatus,
) -> axum::response::Response {
  let updated_at = Utc::now();
  {
    let mut rooms = state.rooms.write().await;
    let Some(room) = rooms.get_mut(&room_id) else {
      return not_found("room");
    };
    room.status = status;
    room.updated_at = updated_at;
  }
  if let Err(error) =
    db::update_room_status(&state.db, room_id, status, updated_at).await
  {
    tracing::warn!(%error, "failed to persist status change");
    return internal("failed to update status");
  }

  let handle = {
    let handles = state.room_handles.read().await;
    handles.get(&room_id).cloned()
  };
  if let Some(handle) = handle {
    match status {
      RoomStatus::Paused => handle.request_pause(),
      RoomStatus::Active => handle.request_resume(),
      RoomStatus::Failed => handle.request_stop(),
    }
  }

  let sender = state.ensure_room_stream(room_id).await;
  let _ = sender.send(WsEvent::RoomStatus { status });

  (StatusCode::OK, Json(json!({"status": status.as_str()}))).into_response()
}

async fn list_reports(
  Path(room_id): Path<Uuid>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  match db::load_room_reports(&state.db, room_id).await {
    Ok(reports) => {
      (StatusCode::OK, Json(json!({"reports": reports}))).into_response()
    }
    Err(error) => {
      tracing::warn!(%error, "failed to load reports");
      internal("failed to load reports")
    }
  }
}

async fn get_report(
  Path((room_id, sequence)): Path<(Uuid, u64)>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  match db::load_room_report(&state.db, room_id, sequence).await {
    Ok(Some(report)) => {
      (StatusCode::OK, Json(json!({"report": report}))).into_response()
    }
    Ok(None) => not_found("report"),
    Err(error) => {
      tracing::warn!(%error, "failed to load report");
      internal("failed to load report")
    }
  }
}

// -- WebSocket -------------------------------------------------------------

async fn stream_room_events(
  Path(room_id): Path<Uuid>,
  State(state): State<AppState>,
  ws: WebSocketUpgrade,
) -> axum::response::Response {
  let room_view = {
    let rooms = state.rooms.read().await;
    rooms.get(&room_id).map(|room| room.view())
  };
  let Some(room_view) = room_view else {
    return not_found("room");
  };

  let events = db::load_room_events(&state.db, room_id)
    .await
    .report()
    .unwrap_or_default();
  let reports = db::load_room_reports(&state.db, room_id)
    .await
    .report()
    .unwrap_or_default();

  let snapshot = WsEvent::Snapshot {
    room: Box::new(room_view),
    events,
    reports,
  };
  let sender = state.ensure_room_stream(room_id).await;
  ws.on_upgrade(move |socket| {
    handle_socket(socket, sender.subscribe(), snapshot)
  })
}

async fn handle_socket(
  mut socket: WebSocket,
  mut receiver: broadcast::Receiver<WsEvent>,
  snapshot: WsEvent,
) {
  if !send_event(&mut socket, &snapshot).await {
    return;
  }
  loop {
    tokio::select! {
      incoming = socket.recv() => match incoming {
        Some(Ok(Message::Close(_))) | None => break,
        Some(Ok(_)) => {}
        Some(Err(_)) => break,
      },
      event = receiver.recv() => match event {
        Ok(event) => {
          if !send_event(&mut socket, &event).await {
            break;
          }
        }
        Err(broadcast::error::RecvError::Lagged(_)) => continue,
        Err(broadcast::error::RecvError::Closed) => break,
      },
    }
  }
}

async fn send_event(socket: &mut WebSocket, event: &WsEvent) -> bool {
  let payload = match serde_json::to_string(event) {
    Ok(value) => value,
    Err(error) => {
      tracing::warn!(%error, "failed to serialize ws event");
      return false;
    }
  };
  socket.send(Message::Text(payload)).await.is_ok()
}

// -- Helpers ---------------------------------------------------------------

fn validate_provider_config(config: &ProviderConfig) -> Result<(), String> {
  if config.model.trim().is_empty() {
    return Err("model is required".to_string());
  }
  if config.base_url.trim().is_empty() {
    return Err("base_url is required".to_string());
  }
  if matches!(config.api_type, crate::models::ApiType::OpenRouter)
    && config
      .api_key
      .as_deref()
      .map(str::trim)
      .filter(|k| !k.is_empty())
      .is_none()
  {
    return Err("api_key is required for OpenRouter".to_string());
  }
  Ok(())
}

async fn unique_slug(
  state: &AppState,
  name: &str,
  exclude: Option<Uuid>,
) -> Result<String> {
  let base = slugify(name);
  if base.is_empty() {
    return Ok(format!("room-{}", Uuid::new_v4().simple()));
  }
  if !db::slug_taken(&state.db, &base, exclude).await? {
    return Ok(base);
  }
  for attempt in 1..SLUG_MAX_ATTEMPTS {
    let candidate = format!("{base}-{attempt}");
    if !db::slug_taken(&state.db, &candidate, exclude).await? {
      return Ok(candidate);
    }
  }
  Ok(format!("{base}-{}", Uuid::new_v4().simple()))
}

fn bad_request(field: &str, message: &str) -> axum::response::Response {
  (
    StatusCode::BAD_REQUEST,
    Json(json!({"error": format!("{field}: {message}")})),
  )
    .into_response()
}

fn not_found(what: &str) -> axum::response::Response {
  (
    StatusCode::NOT_FOUND,
    Json(json!({"error": format!("{what} not found")})),
  )
    .into_response()
}

fn internal(message: &str) -> axum::response::Response {
  (
    StatusCode::INTERNAL_SERVER_ERROR,
    Json(json!({"error": message})),
  )
    .into_response()
}
