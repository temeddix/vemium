//! SQLite persistence layer.
//!
//! All database access goes through this module. Functions in this file are
//! intentionally low-level: they take/return domain types from
//! [`crate::models`] and translate to/from SQLite rows. They do not know
//! about app state, broadcast channels, or LLM behavior.
//!
//! Room-local chat history lives in workspace `CHAT.db` files; see
//! [`crate::chat_db`] for event and report persistence.

use crate::models::{
  AppSettings, DebateState, ProviderConfig, Room, RoomState,
};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::Row;
use sqlx::sqlite::{
  SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions,
};
use sqlx::{SqlitePool, sqlite::SqliteRow};

// -- Pool ------------------------------------------------------------------

/// Opens (or creates) the SQLite database, runs migrations, and returns the
/// pool. The pool's max connection count is small because all writes
/// originate from the orchestrator and a handful of API handlers.
pub async fn init_pool(database_url: &str) -> Result<SqlitePool> {
  let options = database_url
    .parse::<SqliteConnectOptions>()
    .context("invalid DATABASE_URL")?
    .journal_mode(SqliteJournalMode::Wal)
    .foreign_keys(true)
    .create_if_missing(true);

  let pool = SqlitePoolOptions::new()
    .max_connections(5)
    .connect_with(options)
    .await
    .context("failed to connect to SQLite database")?;

  sqlx::migrate!("./migrations")
    .run(&pool)
    .await
    .context("failed to run database migrations")?;

  Ok(pool)
}

// -- Rooms -----------------------------------------------------------------

/// Inserts a new room. Fails if a room with the same `code` already exists.
pub async fn insert_room(pool: &SqlitePool, room: &Room) -> Result<()> {
  sqlx::query(
    "INSERT INTO rooms (
        code, topic, goal, instruction, room_state, debate_state,
        chat_interval_seconds, steering_interval_seconds,
        report_schedule_cron, report_schedule_label,
        python_timeout_seconds,
        resume_schedule_cron, resume_schedule_label,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
  .bind(&room.code)
  .bind(&room.topic)
  .bind(&room.goal)
  .bind(room.instruction.as_deref())
  .bind(room.room_state.as_str())
  .bind(room.debate_state.as_str())
  .bind(room.chat_interval_seconds as i64)
  .bind(room.steering_interval_seconds as i64)
  .bind(&room.report_schedule_cron)
  .bind(&room.report_schedule_label)
  .bind(room.python_timeout_seconds as i64)
  .bind(&room.resume_schedule_cron)
  .bind(&room.resume_schedule_label)
  .bind(room.created_at.to_rfc3339())
  .bind(room.updated_at.to_rfc3339())
  .execute(pool)
  .await
  .context("failed to insert room")?;

  Ok(())
}

/// Replaces every mutable field of an existing room. The orchestrator does
/// not call this directly — only the `PATCH /v1/rooms/:code` handler does.
pub async fn update_room(pool: &SqlitePool, room: &Room) -> Result<()> {
  sqlx::query(
    "UPDATE rooms SET
        topic = ?, goal = ?, instruction = ?,
        room_state = ?, debate_state = ?,
        chat_interval_seconds = ?, steering_interval_seconds = ?,
        report_schedule_cron = ?, report_schedule_label = ?,
        python_timeout_seconds = ?,
        resume_schedule_cron = ?, resume_schedule_label = ?,
        updated_at = ?
     WHERE code = ?",
  )
  .bind(&room.topic)
  .bind(&room.goal)
  .bind(room.instruction.as_deref())
  .bind(room.room_state.as_str())
  .bind(room.debate_state.as_str())
  .bind(room.chat_interval_seconds as i64)
  .bind(room.steering_interval_seconds as i64)
  .bind(&room.report_schedule_cron)
  .bind(&room.report_schedule_label)
  .bind(room.python_timeout_seconds as i64)
  .bind(&room.resume_schedule_cron)
  .bind(&room.resume_schedule_label)
  .bind(room.updated_at.to_rfc3339())
  .bind(&room.code)
  .execute(pool)
  .await
  .context("failed to update room")?;

  Ok(())
}

/// Updates the user-controlled [`RoomState`] gate (`active` /
/// `deactivated`) and `updated_at`. Used by the user-facing
/// `/v1/rooms/:code/activate` and `/deactivate` endpoints.
pub async fn update_room_state(
  pool: &SqlitePool,
  room_code: &str,
  state: RoomState,
  updated_at: DateTime<Utc>,
) -> Result<()> {
  sqlx::query("UPDATE rooms SET room_state = ?, updated_at = ? WHERE code = ?")
    .bind(state.as_str())
    .bind(updated_at.to_rfc3339())
    .bind(room_code)
    .execute(pool)
    .await
    .context("failed to update room_state")?;
  Ok(())
}

/// Updates the leader-controlled [`DebateState`] gate (`running` /
/// `paused`) and `updated_at`. Used by `pause_room` / `resume_room`.
pub async fn update_debate_state(
  pool: &SqlitePool,
  room_code: &str,
  state: DebateState,
  updated_at: DateTime<Utc>,
) -> Result<()> {
  sqlx::query(
    "UPDATE rooms SET debate_state = ?, updated_at = ? WHERE code = ?",
  )
  .bind(state.as_str())
  .bind(updated_at.to_rfc3339())
  .bind(room_code)
  .execute(pool)
  .await
  .context("failed to update debate_state")?;
  Ok(())
}

/// Deletes a room and all of its events/reports (FK cascade).
pub async fn delete_room(pool: &SqlitePool, room_code: &str) -> Result<()> {
  sqlx::query("DELETE FROM rooms WHERE code = ?")
    .bind(room_code)
    .execute(pool)
    .await
    .context("failed to delete room")?;
  Ok(())
}

pub async fn load_all_rooms(pool: &SqlitePool) -> Result<Vec<Room>> {
  let rows = sqlx::query("SELECT * FROM rooms ORDER BY created_at DESC")
    .fetch_all(pool)
    .await
    .context("failed to load rooms")?;

  rows.into_iter().map(parse_room_row).collect()
}

/// Returns true if the given code is already taken. Used by room creation
/// to retry generation in the (vanishingly rare) case of a collision.
pub async fn code_taken(pool: &SqlitePool, code: &str) -> Result<bool> {
  let row = sqlx::query("SELECT 1 AS taken FROM rooms WHERE code = ? LIMIT 1")
    .bind(code)
    .fetch_optional(pool)
    .await
    .context("failed to check code uniqueness")?;
  Ok(row.is_some())
}

fn parse_room_row(row: SqliteRow) -> Result<Room> {
  let room_state_str: String = row
    .try_get("room_state")
    .context("rooms.room_state missing")?;
  let room_state = RoomState::parse(&room_state_str)?;
  let debate_state_str: String = row
    .try_get("debate_state")
    .context("rooms.debate_state missing")?;
  let debate_state = DebateState::parse(&debate_state_str)?;

  let chat_interval: i64 = row
    .try_get("chat_interval_seconds")
    .context("rooms.chat_interval_seconds missing")?;
  let steering_interval: i64 = row
    .try_get("steering_interval_seconds")
    .context("rooms.steering_interval_seconds missing")?;
  let python_timeout: i64 = row
    .try_get("python_timeout_seconds")
    .context("rooms.python_timeout_seconds missing")?;

  Ok(Room {
    code: row.try_get("code").context("rooms.code missing")?,
    topic: row.try_get("topic").context("rooms.topic missing")?,
    goal: row.try_get("goal").context("rooms.goal missing")?,
    instruction: row
      .try_get("instruction")
      .context("rooms.instruction missing")?,
    room_state,
    debate_state,
    chat_interval_seconds: chat_interval as u64,
    steering_interval_seconds: steering_interval as u64,
    report_schedule_cron: row
      .try_get("report_schedule_cron")
      .context("rooms.report_schedule_cron missing")?,
    report_schedule_label: row
      .try_get("report_schedule_label")
      .context("rooms.report_schedule_label missing")?,
    python_timeout_seconds: python_timeout as u64,
    resume_schedule_cron: row
      .try_get("resume_schedule_cron")
      .context("rooms.resume_schedule_cron missing")?,
    resume_schedule_label: row
      .try_get("resume_schedule_label")
      .context("rooms.resume_schedule_label missing")?,
    created_at: parse_timestamp(&row, "created_at")?,
    updated_at: parse_timestamp(&row, "updated_at")?,
  })
}

// -- App settings ----------------------------------------------------------

/// Loads the singleton `app_settings` row. The migration always seeds row 1,
/// so this either returns the user's saved settings or the empty
/// placeholder.
pub async fn load_app_settings(pool: &SqlitePool) -> Result<AppSettings> {
  let row = sqlx::query(
    "SELECT low_provider_config, high_provider_config, updated_at
     FROM app_settings WHERE id = 1",
  )
  .fetch_one(pool)
  .await
  .context("failed to load app settings")?;

  let low_json: String = row
    .try_get("low_provider_config")
    .context("app_settings.low_provider_config missing")?;
  let high_json: String = row
    .try_get("high_provider_config")
    .context("app_settings.high_provider_config missing")?;
  let low: ProviderConfig = serde_json::from_str(&low_json)
    .context("app_settings.low_provider_config: invalid JSON")?;
  let high: ProviderConfig = serde_json::from_str(&high_json)
    .context("app_settings.high_provider_config: invalid JSON")?;

  Ok(AppSettings {
    low,
    high,
    updated_at: parse_timestamp(&row, "updated_at")?,
  })
}

/// Persists the singleton `app_settings` row. Caller has already validated
/// both provider configs and resolved any redacted-key sentinels.
pub async fn update_app_settings(
  pool: &SqlitePool,
  settings: &AppSettings,
) -> Result<()> {
  let low_json = serde_json::to_string(&settings.low)
    .context("failed to encode low provider config")?;
  let high_json = serde_json::to_string(&settings.high)
    .context("failed to encode high provider config")?;

  sqlx::query(
    "UPDATE app_settings
     SET low_provider_config = ?, high_provider_config = ?, updated_at = ?
     WHERE id = 1",
  )
  .bind(&low_json)
  .bind(&high_json)
  .bind(settings.updated_at.to_rfc3339())
  .execute(pool)
  .await
  .context("failed to update app settings")?;
  Ok(())
}

// -- Helpers ---------------------------------------------------------------

fn parse_timestamp(row: &SqliteRow, column: &str) -> Result<DateTime<Utc>> {
  let raw: String = row
    .try_get(column)
    .with_context(|| format!("{column}: missing"))?;
  parse_rfc3339(&raw)
}

fn parse_rfc3339(raw: &str) -> Result<DateTime<Utc>> {
  let parsed = DateTime::parse_from_rfc3339(raw)
    .with_context(|| format!("not an RFC3339 timestamp: {raw}"))?;
  Ok(parsed.with_timezone(&Utc))
}
