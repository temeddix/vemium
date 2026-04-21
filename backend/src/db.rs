use crate::models::{
  RunEvent, RunLaunchSettings, RunRecord, RunStatus, UpsertRunSettingsRequest,
};
use anyhow::{Context, Result, anyhow};
use sqlx::sqlite::{
  SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions,
};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

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
  let status = run_status_to_str(&run.status);
  let interval = run.interval_seconds as i64;
  let rounds = run.rounds as i64;
  let run_forever = bool_to_sqlite(run.run_forever);

  sqlx::query(
        "INSERT INTO runs \
         (id, kind, status, topic, goal, instruction, background, interval_seconds, rounds, run_forever, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind("discussion")
    .bind(status)
    .bind(&run.topic)
    .bind(&run.goal)
    .bind(&run.instruction)
    .bind(&run.background)
    .bind(interval)
    .bind(rounds)
    .bind(run_forever)
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
         interval_seconds, rounds, run_forever, created_at, updated_at \
         FROM runs ORDER BY created_at DESC",
  )
  .fetch_all(pool)
  .await
  .context("failed to load runs from database")?;

  let mut runs = Vec::with_capacity(rows.len());
  for row in rows {
    let id_str: String = row.try_get("id").context("runs.id: invalid value")?;
    let id: Uuid = id_str.parse().context("runs.id: invalid UUID")?;
    let status_str: String = row
      .try_get("status")
      .context("runs.status: invalid value")?;
    let interval_seconds: i64 = row
      .try_get("interval_seconds")
      .context("runs.interval_seconds: invalid value")?;
    let rounds: i64 = row
      .try_get("rounds")
      .context("runs.rounds: invalid value")?;
    let run_forever: i64 = row
      .try_get("run_forever")
      .context("runs.run_forever: invalid value")?;

    runs.push(RunRecord {
      id,
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
      run_forever: sqlite_to_bool(run_forever),
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

pub async fn load_run_events(
  pool: &SqlitePool,
  run_id: Uuid,
) -> Result<Vec<RunEvent>> {
  let run_id_str = run_id.to_string();
  let rows = sqlx::query(
    "SELECT run_id, sequence, event_type, agent, content, timestamp \
     FROM run_events WHERE run_id = ? ORDER BY sequence ASC",
  )
  .bind(&run_id_str)
  .fetch_all(pool)
  .await
  .context("failed to load run events from database")?;

  let mut events = Vec::with_capacity(rows.len());
  for row in rows {
    let run_id_raw: String = row
      .try_get("run_id")
      .context("run_events.run_id: invalid value")?;
    let parsed_run_id: Uuid = run_id_raw
      .parse()
      .context("run_events.run_id: invalid UUID")?;
    let sequence: i64 = row
      .try_get("sequence")
      .context("run_events.sequence: invalid value")?;

    events.push(RunEvent {
      run_id: parsed_run_id,
      sequence: sequence as u64,
      event_type: row
        .try_get("event_type")
        .context("run_events.event_type: invalid value")?,
      agent: row
        .try_get("agent")
        .context("run_events.agent: invalid value")?,
      content: row
        .try_get("content")
        .context("run_events.content: invalid value")?,
      timestamp: row
        .try_get("timestamp")
        .context("run_events.timestamp: invalid value")?,
    });
  }

  Ok(events)
}

pub async fn load_all_settings(
  pool: &SqlitePool,
) -> Result<Vec<RunLaunchSettings>> {
  let rows = sqlx::query(
    "SELECT kind, topic, goal, instruction, background, interval_minutes, \
     turns, autorun, updated_at FROM run_settings ORDER BY kind ASC",
  )
  .fetch_all(pool)
  .await
  .context("failed to load run settings")?;

  let mut settings = Vec::with_capacity(rows.len());
  for row in rows {
    let interval_minutes: i64 = row
      .try_get("interval_minutes")
      .context("run_settings.interval_minutes: invalid value")?;
    let turns: i64 = row
      .try_get("turns")
      .context("run_settings.turns: invalid value")?;
    let autorun: i64 = row
      .try_get("autorun")
      .context("run_settings.autorun: invalid value")?;

    settings.push(RunLaunchSettings {
      topic: row
        .try_get("topic")
        .context("run_settings.topic: invalid value")?,
      goal: row
        .try_get("goal")
        .context("run_settings.goal: invalid value")?,
      instruction: row
        .try_get("instruction")
        .context("run_settings.instruction: invalid value")?,
      background: row
        .try_get("background")
        .context("run_settings.background: invalid value")?,
      interval_minutes: interval_minutes as u32,
      turns: turns as u32,
      autorun: sqlite_to_bool(autorun),
      updated_at: row
        .try_get("updated_at")
        .context("run_settings.updated_at: invalid value")?,
    });
  }

  Ok(settings)
}

pub async fn upsert_settings(
  pool: &SqlitePool,
  request: &UpsertRunSettingsRequest,
  updated_at: &str,
) -> Result<RunLaunchSettings> {
  let interval_minutes = request.interval_minutes as i64;
  let turns = request.turns as i64;
  let autorun = bool_to_sqlite(request.autorun);

  sqlx::query(
    "INSERT INTO run_settings \
     (kind, topic, goal, instruction, background, interval_minutes, turns, autorun, updated_at) \
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) \
     ON CONFLICT(kind) DO UPDATE SET \
     topic=excluded.topic, goal=excluded.goal, instruction=excluded.instruction, \
     background=excluded.background, interval_minutes=excluded.interval_minutes, \
     turns=excluded.turns, autorun=excluded.autorun, \
     updated_at=excluded.updated_at",
  )
  .bind("discussion")
  .bind(&request.topic)
  .bind(&request.goal)
  .bind(&request.instruction)
  .bind(&request.background)
  .bind(interval_minutes)
  .bind(turns)
  .bind(autorun)
  .bind(updated_at)
  .execute(pool)
  .await
  .context("failed to upsert run settings")?;

  Ok(RunLaunchSettings {
    topic: request.topic.clone(),
    goal: request.goal.clone(),
    instruction: request.instruction.clone(),
    background: request.background.clone(),
    interval_minutes: request.interval_minutes,
    turns: request.turns,
    autorun: request.autorun,
    updated_at: updated_at.to_string(),
  })
}

pub async fn load_settings(
  pool: &SqlitePool,
) -> Result<Option<RunLaunchSettings>> {
  let row = sqlx::query(
    "SELECT topic, goal, instruction, background, interval_minutes, \
     turns, autorun, updated_at FROM run_settings WHERE kind = 'discussion'",
  )
  .fetch_optional(pool)
  .await
  .context("failed to load run settings by kind")?;

  let Some(row) = row else {
    return Ok(None);
  };

  let interval_minutes: i64 = row
    .try_get("interval_minutes")
    .context("run_settings.interval_minutes: invalid value")?;
  let turns: i64 = row
    .try_get("turns")
    .context("run_settings.turns: invalid value")?;
  let autorun: i64 = row
    .try_get("autorun")
    .context("run_settings.autorun: invalid value")?;

  Ok(Some(RunLaunchSettings {
    topic: row
      .try_get("topic")
      .context("run_settings.topic: invalid value")?,
    goal: row
      .try_get("goal")
      .context("run_settings.goal: invalid value")?,
    instruction: row
      .try_get("instruction")
      .context("run_settings.instruction: invalid value")?,
    background: row
      .try_get("background")
      .context("run_settings.background: invalid value")?,
    interval_minutes: interval_minutes as u32,
    turns: turns as u32,
    autorun: sqlite_to_bool(autorun),
    updated_at: row
      .try_get("updated_at")
      .context("run_settings.updated_at: invalid value")?,
  }))
}

fn run_status_to_str(status: &RunStatus) -> &'static str {
  match status {
    RunStatus::Queued => "queued",
    RunStatus::Running => "running",
    RunStatus::Completed => "completed",
    RunStatus::Failed => "failed",
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

fn bool_to_sqlite(value: bool) -> i64 {
  if value { 1 } else { 0 }
}

fn sqlite_to_bool(value: i64) -> bool {
  value != 0
}

