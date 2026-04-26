use crate::app_state::AppState;
use crate::db;
use crate::routes;
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use cron::Schedule;
use std::str::FromStr;
use tokio::time::{Duration, sleep};

const SCHEDULER_POLL_SECONDS: u64 = 20;

pub fn spawn_room_scheduler(state: AppState) {
  tokio::spawn(async move {
    run_room_scheduler(state).await;
  });
}

async fn run_room_scheduler(state: AppState) {
  let mut last_fired_minute: Option<i64> = None;

  loop {
    if let Err(error) =
      check_and_spawn_room(&state, &mut last_fired_minute).await
    {
      tracing::warn!(%error, "room scheduler tick failed");
    }

    sleep(Duration::from_secs(SCHEDULER_POLL_SECONDS)).await;
  }
}

async fn check_and_spawn_room(
  state: &AppState,
  last_fired_minute: &mut Option<i64>,
) -> anyhow::Result<()> {
  let Some(settings) = db::load_settings(&state.db).await? else {
    return Ok(());
  };

  let raw_schedule = settings.room_schedule.trim();
  if raw_schedule.is_empty() {
    return Ok(());
  }

  let expression = normalize_cron_expression(raw_schedule)?;
  let schedule = Schedule::from_str(&expression)?;
  let now = Utc::now();
  let current_minute = now.timestamp() / 60;

  if *last_fired_minute == Some(current_minute) {
    return Ok(());
  }

  let window_start =
    now - ChronoDuration::seconds(SCHEDULER_POLL_SECONDS as i64 + 1);
  if is_due_between(&schedule, window_start, now) {
    let created = routes::create_scheduled_room(state.clone()).await;
    if let Some(run) = created {
      tracing::info!(run_id = %run.id, "created scheduled room");
    }
    *last_fired_minute = Some(current_minute);
  }

  Ok(())
}

fn is_due_between(
  schedule: &Schedule,
  from: DateTime<Utc>,
  to: DateTime<Utc>,
) -> bool {
  let mut upcoming = schedule.after(&from);
  if let Some(next) = upcoming.next() {
    return next <= to;
  }
  false
}

fn normalize_cron_expression(raw: &str) -> anyhow::Result<String> {
  let part_count = raw.split_whitespace().count();
  match part_count {
    5 => Ok(format!("0 {raw}")),
    6 | 7 => Ok(raw.to_string()),
    _ => Err(anyhow::anyhow!(
      "invalid room schedule cron: expected 5, 6, or 7 fields"
    )),
  }
}
