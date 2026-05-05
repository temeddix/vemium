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
//! POST   /v1/rooms/:id/messages
//! GET    /v1/rooms/:id/reports
//! GET    /v1/rooms/:id/reports/:seq
//! GET    /v1/rooms/:id/stream    (WebSocket)
//! ```

use crate::app_state::AppState;
use crate::config::room_defaults;
use crate::db;
use crate::error::ReportError;
use crate::models::{
  CreateMessageRequest, CreateRoomRequest, ProviderConfig,
  REDACTED_API_KEY_SENTINEL, Room, RoomEvent, RoomEventKind, RoomStatus,
  UpdateRoomRequest,
};
use crate::runtime;
use crate::streaming::{RoomReceiver, WsEvent, new_turn_id};
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
    .route("/v1/rooms/:room_id/messages", post(post_user_message))
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
  if let Some(cron) = payload.resume_schedule_cron.as_deref()
    && let Err(error) = validate_supported_resume_cron(cron)
  {
    return bad_request("resumeScheduleCron", &error);
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
    steering_interval_seconds: payload
      .steering_interval_seconds
      .unwrap_or(room_defaults::STEERING_INTERVAL_SECONDS),
    report_interval_seconds: payload
      .report_interval_seconds
      .unwrap_or(room_defaults::REPORT_INTERVAL_SECONDS),
    python_timeout_seconds: payload
      .python_timeout_seconds
      .unwrap_or(room_defaults::PYTHON_TIMEOUT_SECONDS),
    auto_pause_when_converged: payload
      .auto_pause_when_converged
      .unwrap_or(room_defaults::AUTO_PAUSE_WHEN_CONVERGED),
    resume_schedule_cron: payload
      .resume_schedule_cron
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .unwrap_or_else(|| room_defaults::RESUME_SCHEDULE_CRON.to_string()),
    resume_schedule_label: payload
      .resume_schedule_label
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .unwrap_or_else(|| room_defaults::RESUME_SCHEDULE_LABEL.to_string()),
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
  if let Some(value) = payload.resume_schedule_cron.as_deref()
    && let Err(error) = validate_supported_resume_cron(value)
  {
    return bad_request("resumeScheduleCron", &error);
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
  if let Some(value) = payload.steering_interval_seconds {
    updated.steering_interval_seconds = value;
  }
  if let Some(value) = payload.report_interval_seconds {
    updated.report_interval_seconds = value;
  }
  if let Some(value) = payload.python_timeout_seconds {
    updated.python_timeout_seconds = value;
  }
  if let Some(value) = payload.auto_pause_when_converged {
    updated.auto_pause_when_converged = value;
  }
  if let Some(value) = payload.resume_schedule_cron {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
      updated.resume_schedule_cron = trimmed.to_string();
    }
  }
  if let Some(value) = payload.resume_schedule_label {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
      updated.resume_schedule_label = trimmed.to_string();
    }
  }
  if let Some(mut value) = payload.low {
    preserve_existing_api_key_if_redacted(&mut value, &updated.low);
    updated.low = value;
  }
  if let Some(mut value) = payload.high {
    preserve_existing_api_key_if_redacted(&mut value, &updated.high);
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
  if let Some(handle) = state.room_handles.read().await.get(&room_id) {
    handle.notify_config_changed();
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

  let stream = state.ensure_room_stream(room_id).await;
  stream.send(WsEvent::RoomStatus { status });

  (StatusCode::OK, Json(json!({"status": status.as_str()}))).into_response()
}

/// Author of a `user_chat` row. Stable string so the frontend can pick the
/// "self" alignment + color without per-room user accounts.
const USER_AGENT_NAME: &str = "user";

/// Injects a human-authored message into a room. Allowed regardless of the
/// room's lifecycle state — the orchestrator will see it on its next turn
/// when the room resumes (or immediately, if active).
async fn post_user_message(
  Path(room_id): Path<Uuid>,
  State(state): State<AppState>,
  Json(payload): Json<CreateMessageRequest>,
) -> impl IntoResponse {
  let content = payload.content.trim().to_string();
  if content.is_empty() {
    return bad_request("content", "must not be empty");
  }

  if !state.rooms.read().await.contains_key(&room_id) {
    return not_found("room");
  }

  let handle = {
    let handles = state.room_handles.read().await;
    match handles.get(&room_id).cloned() {
      Some(handle) => handle,
      None => return not_found("room"),
    }
  };

  let event = RoomEvent {
    room_id,
    sequence: handle.allocate_event_sequence(),
    kind: RoomEventKind::UserChat,
    agent: Some(USER_AGENT_NAME.to_string()),
    content,
    reasoning: String::new(),
    tool_calls: Vec::new(),
    timestamp: Utc::now(),
  };

  if let Err(error) = db::insert_event(&state.db, &event).await {
    tracing::warn!(%error, "failed to insert user message");
    return internal("failed to persist message");
  }

  let stream = state.ensure_room_stream(room_id).await;
  stream.send(WsEvent::MessageAdded {
    turn_id: new_turn_id(),
    message: event.clone(),
  });

  (StatusCode::CREATED, Json(json!({"message": event}))).into_response()
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
  if state.rooms.read().await.get(&room_id).is_none() {
    return not_found("room");
  }
  let stream = state.ensure_room_stream(room_id).await;
  let receiver = stream.subscribe();
  ws.on_upgrade(move |socket| handle_socket(socket, state, room_id, receiver))
}

/// Builds the snapshot frame sent right after a successful upgrade so the
/// client starts from the persisted state. Returns `None` if the room was
/// deleted between connection acceptance and snapshot construction.
async fn build_snapshot(state: &AppState, room_id: Uuid) -> Option<WsEvent> {
  let room_view = state.rooms.read().await.get(&room_id).map(Room::view)?;
  let messages = db::load_room_events(&state.db, room_id)
    .await
    .report()
    .unwrap_or_default();
  let reports = db::load_room_reports(&state.db, room_id)
    .await
    .report()
    .unwrap_or_default();
  Some(WsEvent::Snapshot {
    room: Box::new(room_view),
    messages,
    reports,
  })
}

async fn handle_socket(
  mut socket: WebSocket,
  state: AppState,
  room_id: Uuid,
  mut receiver: RoomReceiver,
) {
  let Some(initial) = build_snapshot(&state, room_id).await else {
    return;
  };
  if !send_event(&mut socket, &initial).await {
    return;
  }
  loop {
    // `biased` makes lifecycle frames win the poll order so a backlog of
    // tokens in the second lane can never delay a `TurnStarted` /
    // `TurnCompleted`. Both lanes use bounded mpsc per-subscriber, so
    // there's no shared ring that could evict another connection's
    // events.
    tokio::select! {
      biased;
      incoming = socket.recv() => match incoming {
        Some(Ok(Message::Close(_))) | None => break,
        Some(Ok(_)) => {}
        Some(Err(_)) => break,
      },
      event = receiver.lifecycle.recv() => match event {
        Some(event) => {
          if !send_event(&mut socket, &event).await {
            break;
          }
        }
        // Lifecycle channel closed: producer dropped this subscription
        // (likely lifecycle buffer full -> behind beyond recovery). Bail
        // and let the client reconnect with a fresh snapshot.
        None => break,
      },
      event = receiver.tokens.recv() => match event {
        Some(event) => {
          if !send_event(&mut socket, &event).await {
            break;
          }
        }
        None => break,
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

/// API responses redact `api_key` to the fixed sentinel
/// [`REDACTED_API_KEY_SENTINEL`]. If a settings update echoes that sentinel
/// back, the user did not retype the key — preserve the stored plaintext
/// instead of overwriting it with the sentinel.
fn preserve_existing_api_key_if_redacted(
  incoming: &mut ProviderConfig,
  existing: &ProviderConfig,
) {
  if incoming.api_key.as_deref() == Some(REDACTED_API_KEY_SENTINEL) {
    incoming.api_key = existing.api_key.clone();
  }
}

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

fn validate_supported_resume_cron(cron: &str) -> Result<(), String> {
  let trimmed = cron.trim();
  if trimmed.is_empty() {
    return Err("must not be empty".to_string());
  }
  if matches!(trimmed, "*/15 * * * *" | "*/30 * * * *" | "0 * * * *") {
    return Ok(());
  }
  if matches!(trimmed, "0 */3 * * *" | "0 */6 * * *") {
    return Ok(());
  }
  // Also accept strict daily schedule `M H * * *`.
  let parts: Vec<&str> = trimmed.split_whitespace().collect();
  if parts.len() != 5 {
    return Err("unsupported cron expression".to_string());
  }
  let minute = parts[0].parse::<u32>().ok();
  let hour = parts[1].parse::<u32>().ok();
  if let (Some(m), Some(h)) = (minute, hour)
    && m < 60
    && h < 24
    && parts[2] == "*"
    && parts[3] == "*"
    && parts[4] == "*"
  {
    return Ok(());
  }
  Err("unsupported cron expression".to_string())
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
