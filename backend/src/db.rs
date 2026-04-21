use anyhow::{Context, Result, anyhow};
use sqlx::{
  Row, SqlitePool,
  sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
};
use uuid::Uuid;

use crate::models::{RunEvent, RunKind, RunRecord, RunStatus};

pub async fn init_pool(database_url: &str) -> Result<SqlitePool> {
  let options = database_url
    .parse::<SqliteConnectOptions>()
    .context("invalid DATABASE_URL")?
    .journal_mode(SqliteJournalMode::Wal)
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

pub async fn insert_run(pool: &SqlitePool, run: &RunRecord) -> Result<()> {
  let id = run.id.to_string();
  let kind = run_kind_to_str(&run.kind);
  let status = run_status_to_str(&run.status);
  let interval = run.interval_seconds as i64;
  let rounds = run.rounds as i64;

  sqlx::query(
        "INSERT INTO runs \
         (id, kind, status, topic, goal, instruction, background, interval_seconds, rounds, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(kind)
    .bind(status)
    .bind(&run.topic)
    .bind(&run.goal)
    .bind(&run.instruction)
    .bind(&run.background)
    .bind(interval)
    .bind(rounds)
    .bind(&run.created_at)
    .bind(&run.updated_at)
    .execute(pool)
    .await
    .context("failed to insert run")?;

  Ok(())
}

pub async fn update_run_status(
  pool: &SqlitePool,
  run_id: Uuid,
  status: &RunStatus,
  updated_at: &str,
) -> Result<()> {
  let id = run_id.to_string();
  let status_str = run_status_to_str(status);

  sqlx::query("UPDATE runs SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status_str)
    .bind(updated_at)
    .bind(&id)
    .execute(pool)
    .await
    .context("failed to update run status")?;

  Ok(())
}

pub async fn insert_event(pool: &SqlitePool, event: &RunEvent) -> Result<()> {
  let run_id = event.run_id.to_string();
  let sequence = event.sequence as i64;

  sqlx::query(
        "INSERT INTO run_events (run_id, sequence, event_type, agent, content, timestamp) \
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&run_id)
    .bind(sequence)
    .bind(&event.event_type)
    .bind(&event.agent)
    .bind(&event.content)
    .bind(&event.timestamp)
    .execute(pool)
    .await
    .context("failed to insert run event")?;

  Ok(())
}

pub async fn load_all_runs(pool: &SqlitePool) -> Result<Vec<RunRecord>> {
  let rows = sqlx::query(
    "SELECT id, kind, status, topic, goal, instruction, background, \
         interval_seconds, rounds, created_at, updated_at \
         FROM runs ORDER BY created_at ASC",
  )
  .fetch_all(pool)
  .await
  .context("failed to load runs from database")?;

  let mut runs = Vec::with_capacity(rows.len());
  for row in rows {
    let id_str: String = row.try_get("id").context("runs.id: invalid value")?;
    let id: Uuid = id_str.parse().context("runs.id: invalid UUID")?;
    let kind_str: String =
      row.try_get("kind").context("runs.kind: invalid value")?;
    let status_str: String = row
      .try_get("status")
      .context("runs.status: invalid value")?;
    let interval_seconds: i64 = row
      .try_get("interval_seconds")
      .context("runs.interval_seconds: invalid value")?;
    let rounds: i64 = row
      .try_get("rounds")
      .context("runs.rounds: invalid value")?;

    runs.push(RunRecord {
      id,
      kind: parse_run_kind(&kind_str)?,
      status: parse_run_status(&status_str)?,
      topic: row.try_get("topic").context("runs.topic: invalid value")?,
      goal: row.try_get("goal").context("runs.goal: invalid value")?,
      instruction: row
        .try_get("instruction")
        .context("runs.instruction: invalid value")?,
      background: row
        .try_get("background")
        .context("runs.background: invalid value")?,
      interval_seconds: interval_seconds as u64,
      rounds: rounds as u32,
      created_at: row
        .try_get("created_at")
        .context("runs.created_at: invalid value")?,
      updated_at: row
        .try_get("updated_at")
        .context("runs.updated_at: invalid value")?,
    });
  }

  Ok(runs)
}

fn run_kind_to_str(kind: &RunKind) -> &'static str {
  match kind {
    RunKind::Discussion => "discussion",
    RunKind::WeeklyReport => "weekly_report",
  }
}

fn run_status_to_str(status: &RunStatus) -> &'static str {
  match status {
    RunStatus::Queued => "queued",
    RunStatus::Running => "running",
    RunStatus::Completed => "completed",
    RunStatus::Failed => "failed",
  }
}

fn parse_run_kind(s: &str) -> Result<RunKind> {
  match s {
    "discussion" => Ok(RunKind::Discussion),
    "weekly_report" => Ok(RunKind::WeeklyReport),
    _ => Err(anyhow!("unknown run kind: {s}")),
  }
}

fn parse_run_status(s: &str) -> Result<RunStatus> {
  match s {
    "queued" => Ok(RunStatus::Queued),
    "running" => Ok(RunStatus::Running),
    "completed" => Ok(RunStatus::Completed),
    "failed" => Ok(RunStatus::Failed),
    _ => Err(anyhow!("unknown run status: {s}")),
  }
}
