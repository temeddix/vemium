//! Per-workspace SQLite persistence for room history.
//!
//! Each room stores its chat timeline and reports in `<workspace>/CHAT.db`.
//! The file is already scoped to one room, so tables here intentionally do
//! not carry `room_code` columns or foreign keys to the central `rooms` table.

use crate::models::{RoomEvent, RoomEventKind, RoomReport};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use sqlx::Row;
use sqlx::sqlite::{
  SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions,
};
use sqlx::{SqlitePool, sqlite::SqliteRow};
use std::path::Path;

const CHAT_DB_FILENAME: &str = "CHAT.db";

pub fn chat_db_path(workspace_root: &Path) -> std::path::PathBuf {
  workspace_root.join(CHAT_DB_FILENAME)
}

/// Opens or creates a room's `CHAT.db`, runs chat-history migrations, and
/// returns a small SQLite pool for that workspace.
pub async fn init_pool(db_path: &Path) -> Result<SqlitePool> {
  let options = SqliteConnectOptions::new()
    .filename(db_path)
    .journal_mode(SqliteJournalMode::Wal)
    .foreign_keys(false)
    .create_if_missing(true);

  let pool = SqlitePoolOptions::new()
    .max_connections(5)
    .connect_with(options)
    .await
    .with_context(|| {
      format!(
        "failed to connect to chat database at {}",
        db_path.display()
      )
    })?;

  sqlx::migrate!("./chat_migrations")
    .run(&pool)
    .await
    .with_context(|| {
      format!("failed to run chat migrations for {}", db_path.display())
    })?;

  Ok(pool)
}

// -- Events ----------------------------------------------------------------

pub async fn insert_event(
  pool: &SqlitePool,
  event: &RoomEvent,
) -> Result<RoomEvent> {
  let result = sqlx::query(
    "INSERT INTO room_events
        (sequence, kind, agent, content, detail, success, timestamp, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
  .bind(event.sequence as i64)
  .bind(event.kind.as_str())
  .bind(event.agent.as_deref())
  .bind(&event.content)
  .bind(&event.detail)
  .bind(event.success)
  .bind(event.timestamp.to_rfc3339())
  .bind(event.completed_at.map(|t| t.to_rfc3339()))
  .execute(pool)
  .await
  .context("failed to insert room event")?;
  let mut stored = event.clone();
  stored.id = Some(result.last_insert_rowid());
  Ok(stored)
}

pub async fn update_event_body(
  pool: &SqlitePool,
  id: i64,
  content: &str,
  detail: &str,
) -> Result<()> {
  sqlx::query("UPDATE room_events SET content = ?, detail = ? WHERE id = ?")
    .bind(content)
    .bind(detail)
    .bind(id)
    .execute(pool)
    .await
    .context("failed to update room event body")?;
  Ok(())
}

pub async fn finish_event(
  pool: &SqlitePool,
  id: i64,
  content: &str,
  detail: &str,
  success: bool,
  completed_at: DateTime<Utc>,
) -> Result<()> {
  sqlx::query(
    "UPDATE room_events
     SET content = ?, detail = ?, success = ?, completed_at = ?
     WHERE id = ?",
  )
  .bind(content)
  .bind(detail)
  .bind(success)
  .bind(completed_at.to_rfc3339())
  .bind(id)
  .execute(pool)
  .await
  .context("failed to finish room event")?;
  Ok(())
}

pub async fn close_incomplete_events(pool: &SqlitePool) -> Result<()> {
  let now = Utc::now().to_rfc3339();
  sqlx::query(
    "UPDATE room_events
     SET completed_at = ?, success = 0
     WHERE completed_at IS NULL",
  )
  .bind(now)
  .execute(pool)
  .await
  .context("failed to close incomplete events")?;
  Ok(())
}

pub async fn load_room_events(
  pool: &SqlitePool,
  room_code: &str,
) -> Result<Vec<RoomEvent>> {
  let rows = sqlx::query(
    "SELECT id, sequence, kind, agent, content, detail, success, timestamp, completed_at
     FROM room_events
     ORDER BY sequence ASC",
  )
  .fetch_all(pool)
  .await
  .context("failed to load room events")?;

  rows
    .into_iter()
    .map(|row| parse_event_row(row, room_code))
    .collect()
}

pub async fn load_room_event(
  pool: &SqlitePool,
  room_code: &str,
  sequence: i64,
) -> Result<Option<RoomEvent>> {
  let row = sqlx::query(
    "SELECT id, sequence, kind, agent, content, detail, success, timestamp, completed_at
     FROM room_events
     WHERE sequence = ?",
  )
  .bind(sequence)
  .fetch_optional(pool)
  .await
  .context("failed to load room event")?;
  row.map(|row| parse_event_row(row, room_code)).transpose()
}

pub async fn load_compaction_checkpoint(
  pool: &SqlitePool,
  room_code: &str,
) -> Result<Option<RoomEvent>> {
  let row = sqlx::query(
    "SELECT id, sequence, kind, agent, content, detail, success, timestamp, completed_at
     FROM room_events
     WHERE kind = 'summary'
     ORDER BY sequence DESC
     LIMIT 1",
  )
  .fetch_optional(pool)
  .await
  .context("failed to load compaction checkpoint")?;
  row.map(|row| parse_event_row(row, room_code)).transpose()
}

pub async fn load_room_events_after(
  pool: &SqlitePool,
  room_code: &str,
  after_sequence: u64,
) -> Result<Vec<RoomEvent>> {
  let rows = sqlx::query(
    "SELECT id, sequence, kind, agent, content, detail, success, timestamp, completed_at
     FROM room_events
     WHERE sequence > ?
     ORDER BY sequence ASC",
  )
  .bind(after_sequence as i64)
  .fetch_all(pool)
  .await
  .context("failed to load room events after sequence")?;
  rows
    .into_iter()
    .map(|row| parse_event_row(row, room_code))
    .collect()
}

pub async fn max_event_sequence(pool: &SqlitePool) -> Result<u64> {
  let row = sqlx::query(
    "SELECT COALESCE(MAX(sequence), 0) AS max_seq FROM room_events",
  )
  .fetch_one(pool)
  .await
  .context("failed to read max event sequence")?;

  let max: i64 = row.try_get("max_seq").unwrap_or(0);
  Ok(max as u64)
}

fn parse_event_row(row: SqliteRow, room_code: &str) -> Result<RoomEvent> {
  let id: i64 = row.try_get("id").context("room_events.id missing")?;
  let sequence: i64 = row
    .try_get("sequence")
    .context("room_events.sequence missing")?;
  let kind_str: String =
    row.try_get("kind").context("room_events.kind missing")?;
  let success: bool = row
    .try_get("success")
    .context("room_events.success missing")?;
  let completed_at_str: Option<String> = row
    .try_get("completed_at")
    .context("room_events.completed_at missing")?;
  let completed_at = match completed_at_str {
    Some(value) => Some(parse_rfc3339(&value)?),
    None => None,
  };

  Ok(RoomEvent {
    id: Some(id),
    room_code: room_code.to_string(),
    sequence: sequence as u64,
    kind: RoomEventKind::parse(&kind_str)?,
    agent: row.try_get("agent").context("room_events.agent missing")?,
    content: row
      .try_get("content")
      .context("room_events.content missing")?,
    detail: row
      .try_get("detail")
      .context("room_events.detail missing")?,
    success,
    timestamp: parse_timestamp(&row, "timestamp")?,
    completed_at,
  })
}

// -- Reports ---------------------------------------------------------------

pub async fn start_report(
  pool: &SqlitePool,
  room_code: &str,
  sequence: u64,
  started_at: DateTime<Utc>,
) -> Result<RoomReport> {
  let result = sqlx::query(
    "INSERT INTO room_reports
        (sequence, content, started_at, completed_at, success)
     VALUES (?, ?, ?, NULL, ?)",
  )
  .bind(sequence as i64)
  .bind("")
  .bind(started_at.to_rfc3339())
  .bind(false)
  .execute(pool)
  .await
  .context("failed to start report")?;

  Ok(RoomReport {
    id: result.last_insert_rowid(),
    room_code: room_code.to_string(),
    sequence,
    content: String::new(),
    started_at,
    completed_at: None,
    success: false,
  })
}

pub async fn finish_report(
  pool: &SqlitePool,
  id: i64,
  content: &str,
  success: bool,
  completed_at: DateTime<Utc>,
) -> Result<()> {
  sqlx::query(
    "UPDATE room_reports
     SET content = ?, success = ?, completed_at = ?
     WHERE id = ?",
  )
  .bind(content)
  .bind(success)
  .bind(completed_at.to_rfc3339())
  .bind(id)
  .execute(pool)
  .await
  .context("failed to finish report")?;
  Ok(())
}

pub async fn load_room_reports(
  pool: &SqlitePool,
  room_code: &str,
) -> Result<Vec<RoomReport>> {
  let rows = sqlx::query(
    "SELECT id, sequence, content, started_at, completed_at, success
     FROM room_reports ORDER BY sequence ASC",
  )
  .fetch_all(pool)
  .await
  .context("failed to load room reports")?;

  rows
    .into_iter()
    .map(|row| parse_report_row(row, room_code))
    .collect()
}

pub async fn load_room_report(
  pool: &SqlitePool,
  room_code: &str,
  sequence: u64,
) -> Result<Option<RoomReport>> {
  let row = sqlx::query(
    "SELECT id, sequence, content, started_at, completed_at, success
     FROM room_reports WHERE sequence = ?",
  )
  .bind(sequence as i64)
  .fetch_optional(pool)
  .await
  .context("failed to load room report")?;

  row.map(|row| parse_report_row(row, room_code)).transpose()
}

pub async fn max_report_sequence(pool: &SqlitePool) -> Result<u64> {
  let row = sqlx::query(
    "SELECT COALESCE(MAX(sequence), 0) AS max_seq FROM room_reports",
  )
  .fetch_one(pool)
  .await
  .context("failed to read max report sequence")?;

  let max: i64 = row.try_get("max_seq").unwrap_or(0);
  Ok(max as u64)
}

fn parse_report_row(row: SqliteRow, room_code: &str) -> Result<RoomReport> {
  let sequence: i64 = row
    .try_get("sequence")
    .context("room_reports.sequence missing")?;
  let success: bool = row
    .try_get("success")
    .context("room_reports.success missing")?;
  let completed_at_str: Option<String> = row
    .try_get("completed_at")
    .context("room_reports.completed_at missing")?;

  let completed_at = match completed_at_str {
    Some(value) => Some(parse_rfc3339(&value)?),
    None => None,
  };

  Ok(RoomReport {
    id: row.try_get("id").context("room_reports.id missing")?,
    room_code: room_code.to_string(),
    sequence: sequence as u64,
    content: row
      .try_get("content")
      .context("room_reports.content missing")?,
    started_at: parse_timestamp(&row, "started_at")?,
    completed_at,
    success,
  })
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
