//! HTTP and WebSocket routes.
//!
//! Handlers are intentionally thin: they validate input, call into
//! [`crate::db`] / [`crate::runtime`], and shape JSON responses. All
//! orchestration logic lives in [`crate::runtime`].
//!
//! The API surface is room-centric. Every room is identified by its
//! readable `code`:
//!
//! ```text
//! GET    /v1/health
//! GET    /v1/settings
//! PUT    /v1/settings
//! POST   /v1/providers/:tier/models
//! GET    /v1/rooms
//! POST   /v1/rooms
//! GET    /v1/rooms/:code
//! PATCH  /v1/rooms/:code
//! DELETE /v1/rooms/:code
//! POST   /v1/rooms/:code/clone
//! POST   /v1/rooms/:code/activate
//! POST   /v1/rooms/:code/deactivate
//! POST   /v1/rooms/:code/messages
//! GET    /v1/rooms/:code/reports
//! GET    /v1/rooms/:code/reports/:seq
//! GET    /v1/rooms/:code/files
//! GET    /v1/rooms/:code/files/raw?path=...
//! GET    /v1/rooms/:code/files/download
//! GET    /v1/rooms/:code/stream    (WebSocket)
//! ```
//!
//! `/activate` and `/deactivate` flip the user-controlled [`RoomState`]
//! gate. The leader-controlled [`DebateState`] gate (running / paused)
//! has no public route — it only moves through the `pause_room` /
//! `resume_room` tools called by the leader.

use crate::app_state::AppState;
use crate::config::room_defaults;
use crate::db;
use crate::error::ReportError;
use crate::models::{
  AppSettings, CloneRoomRequest, CreateMessageRequest, CreateRoomRequest,
  DebateState, ProviderConfig, REDACTED_API_KEY_SENTINEL, Room, RoomEvent,
  RoomEventKind, RoomState, UpdateAppSettingsRequest, UpdateRoomRequest,
};
use crate::provider_models;
use crate::runtime;
use crate::streaming::{RoomReceiver, WsEvent, new_turn_id};
use crate::workspace::DebateRoot;
use anyhow::Result;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::{StatusCode, header};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use cron::Schedule;
use rand::Rng;
use serde::Deserialize;
use serde_json::json;
use std::path::PathBuf;
use std::str::FromStr;
use tower_http::services::{ServeDir, ServeFile};

/// Maximum number of code generation attempts before giving up. Collisions
/// with 26^10 ≈ 1.4e14 possibilities are vanishingly rare even with thousands
/// of rooms; this cap exists to bound the loop, not to handle real
/// contention.
const CODE_MAX_ATTEMPTS: u8 = 32;

pub fn create_router(state: AppState) -> Router {
  Router::new()
    .route("/v1/health", get(health_check))
    .route("/v1/settings", get(get_settings).put(update_settings))
    .route("/v1/providers/:tier/models", post(list_provider_models))
    .route("/v1/rooms", get(list_rooms).post(create_room))
    .route(
      "/v1/rooms/:code",
      get(get_room).patch(update_room).delete(delete_room),
    )
    .route("/v1/rooms/:code/clone", post(clone_room))
    .route("/v1/rooms/:code/activate", post(activate_room))
    .route("/v1/rooms/:code/deactivate", post(deactivate_room))
    .route("/v1/rooms/:code/messages", post(post_user_message))
    .route("/v1/rooms/:code/reports", get(list_reports))
    .route("/v1/rooms/:code/reports/:sequence", get(get_report))
    .route("/v1/rooms/:code/files", get(list_room_files))
    .route("/v1/rooms/:code/files/raw", get(get_room_file))
    .route("/v1/rooms/:code/files/download", get(download_room_files))
    .route("/v1/rooms/:code/stream", get(stream_room_events))
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

async fn get_settings(State(state): State<AppState>) -> impl IntoResponse {
  let settings = state.app_settings.read().await;
  (StatusCode::OK, Json(json!({"settings": settings.view()}))).into_response()
}

async fn update_settings(
  State(state): State<AppState>,
  Json(payload): Json<UpdateAppSettingsRequest>,
) -> impl IntoResponse {
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

  let mut updated: AppSettings = state.app_settings.read().await.clone();
  if let Some(mut value) = payload.low {
    preserve_existing_api_key_if_redacted(&mut value, &updated.low);
    updated.low = value;
  }
  if let Some(mut value) = payload.high {
    preserve_existing_api_key_if_redacted(&mut value, &updated.high);
    updated.high = value;
  }
  updated.updated_at = Utc::now();

  if let Err(error) = db::update_app_settings(&state.db, &updated).await {
    tracing::warn!(%error, "failed to persist app settings");
    return internal("failed to persist settings");
  }
  *state.app_settings.write().await = updated.clone();

  // Re-tick every active room so any in-flight wait wakes up and the next
  // LLM call uses the new credentials.
  let handles = state.room_handles.read().await;
  for handle in handles.values() {
    handle.notify_config_changed();
  }
  drop(handles);

  (StatusCode::OK, Json(json!({"settings": updated.view()}))).into_response()
}

/// Probes the provider configured by `payload` and returns the model
/// identifiers it advertises. The settings page calls this with the form's
/// in-progress values so the user can pick from the list before saving;
/// `tier` selects which stored API key the redaction sentinel `***` falls
/// back to when the form hasn't retyped it.
async fn list_provider_models(
  Path(tier): Path<String>,
  State(state): State<AppState>,
  Json(mut payload): Json<ProviderConfig>,
) -> impl IntoResponse {
  let existing = {
    let settings = state.app_settings.read().await;
    match tier.as_str() {
      "low" => settings.low.clone(),
      "high" => settings.high.clone(),
      _ => return bad_request("tier", "must be 'low' or 'high'"),
    }
  };
  preserve_existing_api_key_if_redacted(&mut payload, &existing);

  if payload.base_url.trim().is_empty() {
    return bad_request("baseUrl", "must not be empty");
  }
  if matches!(payload.api_type, crate::models::ApiType::OpenRouter)
    && payload
      .api_key
      .as_deref()
      .map(str::trim)
      .filter(|k| !k.is_empty())
      .is_none()
  {
    return bad_request("apiKey", "is required for OpenRouter");
  }

  match provider_models::fetch_provider_models(&payload).await {
    Ok(models) => {
      let entries: Vec<_> =
        models.into_iter().map(|id| json!({ "id": id })).collect();
      (StatusCode::OK, Json(json!({ "models": entries }))).into_response()
    }
    Err(error) => {
      tracing::info!(%error, "failed to list provider models");
      (
        StatusCode::BAD_GATEWAY,
        Json(json!({"error": error.to_string()})),
      )
        .into_response()
    }
  }
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
  if let Some(cron) = payload.resume_schedule_cron.as_deref()
    && let Err(error) = validate_cron(cron)
  {
    return bad_request("resumeScheduleCron", &error);
  }
  if let Some(cron) = payload.report_schedule_cron.as_deref()
    && let Err(error) = validate_cron(cron)
  {
    return bad_request("reportScheduleCron", &error);
  }

  let topic = payload.topic.trim();
  if topic.is_empty() {
    return bad_request("topic", "must not be empty");
  }
  let goal = payload.goal.trim();
  if goal.is_empty() {
    return bad_request("goal", "must not be empty");
  }

  let code = match unique_code(&state).await {
    Ok(value) => value,
    Err(error) => {
      tracing::warn!(%error, "failed to allocate room code");
      return internal("could not allocate room code");
    }
  };

  let now = Utc::now();
  let room = Room {
    code,
    topic: topic.to_string(),
    goal: goal.to_string(),
    instruction: payload
      .instruction
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty()),
    room_state: RoomState::Deactivated,
    debate_state: DebateState::Running,
    chat_interval_seconds: payload
      .chat_interval_seconds
      .unwrap_or(room_defaults::CHAT_INTERVAL_SECONDS),
    steering_interval_seconds: payload
      .steering_interval_seconds
      .unwrap_or(room_defaults::STEERING_INTERVAL_SECONDS),
    report_schedule_cron: payload
      .report_schedule_cron
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .unwrap_or_else(|| room_defaults::REPORT_SCHEDULE_CRON.to_string()),
    report_schedule_label: payload
      .report_schedule_label
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty())
      .unwrap_or_else(|| room_defaults::REPORT_SCHEDULE_LABEL.to_string()),
    python_timeout_seconds: payload
      .python_timeout_seconds
      .unwrap_or(room_defaults::PYTHON_TIMEOUT_SECONDS),
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
  Path(code): Path<String>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  let rooms = state.rooms.read().await;
  match rooms.get(&code) {
    Some(room) => {
      (StatusCode::OK, Json(json!({"room": room.view()}))).into_response()
    }
    None => not_found("room"),
  }
}

async fn update_room(
  Path(code): Path<String>,
  State(state): State<AppState>,
  Json(payload): Json<UpdateRoomRequest>,
) -> impl IntoResponse {
  let mut updated = {
    let rooms = state.rooms.read().await;
    match rooms.get(&code) {
      Some(room) => room.clone(),
      None => return not_found("room"),
    }
  };

  if let Some(value) = payload.resume_schedule_cron.as_deref()
    && let Err(error) = validate_cron(value)
  {
    return bad_request("resumeScheduleCron", &error);
  }
  if let Some(value) = payload.report_schedule_cron.as_deref()
    && let Err(error) = validate_cron(value)
  {
    return bad_request("reportScheduleCron", &error);
  }

  if let Some(value) = payload.topic {
    let trimmed = value.trim();
    if trimmed.is_empty() {
      return bad_request("topic", "must not be empty");
    }
    updated.topic = trimmed.to_string();
  }
  if let Some(value) = payload.goal {
    let trimmed = value.trim();
    if trimmed.is_empty() {
      return bad_request("goal", "must not be empty");
    }
    updated.goal = trimmed.to_string();
  }
  if let Some(value) = payload.instruction {
    updated.instruction = value
      .map(|s| s.trim().to_string())
      .filter(|s| !s.is_empty());
  }
  if let Some(value) = payload.chat_interval_seconds {
    updated.chat_interval_seconds = value;
  }
  if let Some(value) = payload.steering_interval_seconds {
    updated.steering_interval_seconds = value;
  }
  if let Some(value) = payload.report_schedule_cron {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
      updated.report_schedule_cron = trimmed.to_string();
    }
  }
  if let Some(value) = payload.report_schedule_label {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
      updated.report_schedule_label = trimmed.to_string();
    }
  }
  if let Some(value) = payload.python_timeout_seconds {
    updated.python_timeout_seconds = value;
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
  updated.updated_at = Utc::now();

  if let Err(error) = db::update_room(&state.db, &updated).await {
    tracing::warn!(%error, "failed to update room");
    return internal("failed to persist room update");
  }

  {
    let mut rooms = state.rooms.write().await;
    rooms.insert(updated.code.clone(), updated.clone());
  }
  if let Some(handle) = state.room_handles.read().await.get(&updated.code) {
    handle.notify_config_changed();
  }

  (StatusCode::OK, Json(json!({"room": updated.view()}))).into_response()
}

/// Creates a new room that copies every per-room setting from `code`. The
/// clone always starts active with fresh timestamps and a freshly-allocated
/// code. When `include_history` is true the source room's chat events are
/// duplicated into the clone before the runtime spawns; reports and
/// workspace artifacts are never carried over.
async fn clone_room(
  Path(code): Path<String>,
  State(state): State<AppState>,
  Json(payload): Json<CloneRoomRequest>,
) -> impl IntoResponse {
  let source = {
    let rooms = state.rooms.read().await;
    match rooms.get(&code) {
      Some(room) => room.clone(),
      None => return not_found("room"),
    }
  };

  let new_code = match unique_code(&state).await {
    Ok(value) => value,
    Err(error) => {
      tracing::warn!(%error, "failed to allocate room code");
      return internal("could not allocate room code");
    }
  };

  let now = Utc::now();
  let new_room = Room {
    code: new_code,
    topic: source.topic.clone(),
    goal: source.goal.clone(),
    instruction: source.instruction.clone(),
    room_state: RoomState::Deactivated,
    debate_state: DebateState::Running,
    chat_interval_seconds: source.chat_interval_seconds,
    steering_interval_seconds: source.steering_interval_seconds,
    report_schedule_cron: source.report_schedule_cron.clone(),
    report_schedule_label: source.report_schedule_label.clone(),
    python_timeout_seconds: source.python_timeout_seconds,
    resume_schedule_cron: source.resume_schedule_cron.clone(),
    resume_schedule_label: source.resume_schedule_label.clone(),
    created_at: now,
    updated_at: now,
  };

  if let Err(error) = db::insert_room(&state.db, &new_room).await {
    tracing::warn!(%error, "failed to insert cloned room");
    return internal("failed to persist room");
  }

  if payload.include_history
    && let Err(error) =
      db::clone_room_events(&state.db, &source.code, &new_room.code).await
  {
    tracing::warn!(%error, "failed to copy events into cloned room");
    if let Err(cleanup) = db::delete_room(&state.db, &new_room.code).await {
      tracing::warn!(%cleanup, "failed to roll back partial clone");
    }
    return internal("failed to copy chat history");
  }

  if let Err(error) = runtime::spawn_room(state.clone(), new_room.clone()).await
  {
    tracing::warn!(%error, "failed to spawn cloned room runtime");
    return internal("room created but failed to start runtime");
  }

  let view = new_room.view();
  (StatusCode::CREATED, Json(json!({"room": view}))).into_response()
}

async fn delete_room(
  Path(code): Path<String>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  let handle = {
    let handles = state.room_handles.read().await;
    handles.get(&code).cloned()
  };
  if let Some(handle) = handle {
    handle.request_stop();
  }
  if let Err(error) = db::delete_room(&state.db, &code).await {
    tracing::warn!(%error, "failed to delete room from db");
    return internal("failed to delete room");
  }
  state.forget_room(&code).await;
  (StatusCode::NO_CONTENT, Json(json!({}))).into_response()
}

/// `POST /v1/rooms/:code/activate` — flips the user-controlled
/// [`RoomState`] gate to `Active`. Independent of [`DebateState`]: a room
/// that the leader paused stays paused until the leader (or the resume
/// schedule) flips it back; activating only undoes a prior deactivate.
async fn activate_room(
  Path(code): Path<String>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  set_room_state(state, &code, RoomState::Active).await
}

/// `POST /v1/rooms/:code/deactivate` — flips the user-controlled
/// [`RoomState`] gate to `Deactivated`. The strongest off-switch: while
/// deactivated the orchestrator does not advance regardless of
/// [`DebateState`].
async fn deactivate_room(
  Path(code): Path<String>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  set_room_state(state, &code, RoomState::Deactivated).await
}

async fn set_room_state(
  state: AppState,
  room_code: &str,
  new_state: RoomState,
) -> axum::response::Response {
  let updated_at = Utc::now();
  {
    let mut rooms = state.rooms.write().await;
    let Some(room) = rooms.get_mut(room_code) else {
      return not_found("room");
    };
    room.room_state = new_state;
    room.updated_at = updated_at;
  }
  if let Err(error) =
    db::update_room_state(&state.db, room_code, new_state, updated_at).await
  {
    tracing::warn!(%error, "failed to persist room state change");
    return internal("failed to update room state");
  }

  let handle = {
    let handles = state.room_handles.read().await;
    handles.get(room_code).cloned()
  };
  if let Some(handle) = handle {
    match new_state {
      RoomState::Active => handle.request_activate(),
      RoomState::Deactivated => handle.request_deactivate(),
    }
  }

  let stream = state.ensure_room_stream(room_code).await;
  stream.send(WsEvent::RoomState { state: new_state });

  (
    StatusCode::OK,
    Json(json!({"roomState": new_state.as_str()})),
  )
    .into_response()
}

/// Author of a `user_chat` row. Stable string so the frontend can pick the
/// "self" alignment + color without per-room user accounts.
const USER_AGENT_NAME: &str = "user";

/// Injects a human-authored message into a room. Allowed regardless of the
/// room's lifecycle state — the orchestrator will see it on its next turn
/// when the room resumes (or immediately, if active).
async fn post_user_message(
  Path(code): Path<String>,
  State(state): State<AppState>,
  Json(payload): Json<CreateMessageRequest>,
) -> impl IntoResponse {
  let content = payload.content.trim().to_string();
  if content.is_empty() {
    return bad_request("content", "must not be empty");
  }

  if !state.rooms.read().await.contains_key(&code) {
    return not_found("room");
  }

  let handle = {
    let handles = state.room_handles.read().await;
    match handles.get(&code).cloned() {
      Some(handle) => handle,
      None => return not_found("room"),
    }
  };

  let draft = RoomEvent {
    id: None,
    room_code: code.clone(),
    sequence: handle.allocate_event_sequence(),
    kind: RoomEventKind::UserChat,
    agent: Some(USER_AGENT_NAME.to_string()),
    content,
    reasoning: String::new(),
    detail: String::new(),
    timestamp: Utc::now(),
  };

  let event = match db::insert_event(&state.db, &draft).await {
    Ok(stored) => stored,
    Err(error) => {
      tracing::warn!(%error, "failed to insert user message");
      return internal("failed to persist message");
    }
  };

  let stream = state.ensure_room_stream(&code).await;
  stream.send(WsEvent::MessageAdded {
    turn_id: new_turn_id(),
    message: event.clone(),
  });

  (StatusCode::CREATED, Json(json!({"message": event}))).into_response()
}

async fn list_reports(
  Path(code): Path<String>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  match db::load_room_reports(&state.db, &code).await {
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
  Path((code, sequence)): Path<(String, u64)>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  match db::load_room_report(&state.db, &code, sequence).await {
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

// -- Workspace files -------------------------------------------------------

#[derive(Debug, Deserialize)]
struct FilePathQuery {
  path: String,
}

/// Lists every regular file under the room workspace (recursive). Hidden
/// entries like `.venv` are filtered upstream by [`crate::workspace`].
async fn list_room_files(
  Path(code): Path<String>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  if !state.rooms.read().await.contains_key(&code) {
    return not_found("room");
  }
  let workspace =
    match DebateRoot::new(&state.data_root).workspace_for(&code).await {
      Ok(value) => value,
      Err(error) => {
        tracing::warn!(%error, %code, "failed to open room workspace");
        return internal("failed to open room workspace");
      }
    };
  let entries = match workspace.list_files(std::path::Path::new("")).await {
    Ok(value) => value,
    Err(error) => {
      tracing::warn!(%error, %code, "failed to list workspace files");
      return internal("failed to list workspace files");
    }
  };
  let files: Vec<_> = entries
    .into_iter()
    .map(|entry| {
      json!({
        "path": entry.relative_path,
        "sizeBytes": entry.size_bytes,
      })
    })
    .collect();
  (StatusCode::OK, Json(json!({ "files": files }))).into_response()
}

/// Streams a single workspace file back to the browser. The path comes in as
/// a forward-slash relative string and is fed through
/// [`crate::workspace::RoomWorkspace::resolve`] for sandbox enforcement.
async fn get_room_file(
  Path(code): Path<String>,
  Query(params): Query<FilePathQuery>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  if !state.rooms.read().await.contains_key(&code) {
    return not_found("room");
  }
  let workspace =
    match DebateRoot::new(&state.data_root).workspace_for(&code).await {
      Ok(value) => value,
      Err(error) => {
        tracing::warn!(%error, %code, "failed to open room workspace");
        return internal("failed to open room workspace");
      }
    };
  let relative = PathBuf::from(&params.path);
  let bytes = match workspace.read_file_raw(&relative).await {
    Ok(value) => value,
    Err(error) => {
      tracing::warn!(%error, %code, path = %params.path, "failed to read file");
      return not_found("file");
    }
  };
  let mime = guess_mime(&relative);
  (
    StatusCode::OK,
    [
      (header::CONTENT_TYPE, mime.to_string()),
      (header::CONTENT_DISPOSITION, "inline".to_string()),
    ],
    bytes,
  )
    .into_response()
}

/// Builds a zip archive of the entire workspace and streams it as a file
/// download named `<room-code>.zip`.
async fn download_room_files(
  Path(code): Path<String>,
  State(state): State<AppState>,
) -> impl IntoResponse {
  if !state.rooms.read().await.contains_key(&code) {
    return not_found("room");
  }
  let workspace =
    match DebateRoot::new(&state.data_root).workspace_for(&code).await {
      Ok(value) => value,
      Err(error) => {
        tracing::warn!(%error, %code, "failed to open room workspace");
        return internal("failed to open room workspace");
      }
    };
  let bytes = match workspace.archive_to_zip().await {
    Ok(value) => value,
    Err(error) => {
      tracing::warn!(%error, %code, "failed to archive workspace");
      return internal("failed to archive workspace");
    }
  };
  let disposition = format!("attachment; filename=\"{code}.zip\"");
  (
    StatusCode::OK,
    [
      (header::CONTENT_TYPE, "application/zip".to_string()),
      (header::CONTENT_DISPOSITION, disposition),
    ],
    bytes,
  )
    .into_response()
}

/// Best-effort content type for a workspace file. Covers the formats the
/// agents actually emit (Python source, CSV/JSON data, common images);
/// everything else falls back to `application/octet-stream` so the browser
/// triggers a download instead of trying to render bytes inline.
fn guess_mime(path: &std::path::Path) -> &'static str {
  let extension = path
    .extension()
    .and_then(|e| e.to_str())
    .map(str::to_ascii_lowercase);
  match extension.as_deref() {
    Some("html" | "htm") => "text/html; charset=utf-8",
    Some(
      "txt" | "md" | "py" | "ts" | "tsx" | "js" | "jsx" | "rs" | "toml"
      | "json" | "yaml" | "yml" | "csv" | "tsv" | "log" | "ini" | "xml" | "sh",
    ) => "text/plain; charset=utf-8",
    Some("png") => "image/png",
    Some("jpg" | "jpeg") => "image/jpeg",
    Some("gif") => "image/gif",
    Some("svg") => "image/svg+xml",
    Some("webp") => "image/webp",
    Some("pdf") => "application/pdf",
    _ => "application/octet-stream",
  }
}

// -- WebSocket -------------------------------------------------------------

async fn stream_room_events(
  Path(code): Path<String>,
  State(state): State<AppState>,
  ws: WebSocketUpgrade,
) -> axum::response::Response {
  if state.rooms.read().await.get(&code).is_none() {
    return not_found("room");
  }
  let stream = state.ensure_room_stream(&code).await;
  let receiver = stream.subscribe();
  ws.on_upgrade(move |socket| handle_socket(socket, state, code, receiver))
}

/// Builds the snapshot frame sent right after a successful upgrade so the
/// client starts from the persisted state. Returns `None` if the room was
/// deleted between connection acceptance and snapshot construction.
async fn build_snapshot(state: &AppState, room_code: &str) -> Option<WsEvent> {
  let room_view = state.rooms.read().await.get(room_code).map(Room::view)?;
  let messages = db::load_room_events(&state.db, room_code)
    .await
    .report()
    .unwrap_or_default();
  let reports = db::load_room_reports(&state.db, room_code)
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
  room_code: String,
  mut receiver: RoomReceiver,
) {
  let Some(initial) = build_snapshot(&state, &room_code).await else {
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

pub fn validate_provider_config(config: &ProviderConfig) -> Result<(), String> {
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

/// Validates a 5-field cron expression by parsing it with the `cron` crate.
/// The crate accepts either 5- or 6-field forms; we constrain to 5 fields
/// (no seconds) to match the frontend picker.
fn validate_cron(expression: &str) -> Result<(), String> {
  let trimmed = expression.trim();
  if trimmed.is_empty() {
    return Err("must not be empty".to_string());
  }
  if trimmed.split_whitespace().count() != 5 {
    return Err("expected 5 fields: minute hour day month weekday".to_string());
  }
  // The `cron` crate expects a 7-field schedule (sec min hour dom mon dow
  // year). Prefix a `0 ` for seconds and append `*` for year to map a
  // 5-field cron into the schedule the parser can accept.
  let extended = format!("0 {trimmed} *");
  Schedule::from_str(&extended).map_err(|e| e.to_string())?;
  Ok(())
}

async fn unique_code(state: &AppState) -> Result<String> {
  for _ in 0..CODE_MAX_ATTEMPTS {
    let candidate = generate_room_code();
    if !db::code_taken(&state.db, &candidate).await? {
      return Ok(candidate);
    }
  }
  Err(anyhow::anyhow!(
    "exhausted {} room code attempts",
    CODE_MAX_ATTEMPTS
  ))
}

/// Generates a Google-Meet style 10-letter room code: `xxx-xxxx-xxx`.
fn generate_room_code() -> String {
  let mut rng = rand::thread_rng();
  let mut s = String::with_capacity(12);
  for _ in 0..3 {
    s.push(random_letter(&mut rng));
  }
  s.push('-');
  for _ in 0..4 {
    s.push(random_letter(&mut rng));
  }
  s.push('-');
  for _ in 0..3 {
    s.push(random_letter(&mut rng));
  }
  s
}

fn random_letter(rng: &mut rand::rngs::ThreadRng) -> char {
  let n: u8 = rng.gen_range(0..26);
  (b'a' + n) as char
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
