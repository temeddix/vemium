//! Process-level configuration.
//!
//! With the rewrite to per-room provider configuration, this module is
//! deliberately minimal: only the bind address, database URL, and the
//! filesystem root for room workspaces are kept here. All LLM-related knobs
//! live on the [`crate::models::Room`] itself.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;

/// Filesystem root for room workspaces. Matches the volume mount in
/// `compose.yaml`.
const DEFAULT_DATA_ROOT: &str = "/data";

/// Defaults applied to a new [`crate::models::Room`] when the create request
/// omits a value. Centralized here so the API and the test suite agree.
pub mod room_defaults {
  /// One debater turn every 5 seconds.
  pub const CHAT_INTERVAL_SECONDS: u64 = 5;
  /// Leader emits a steering `leader_note` once an hour.
  pub const STEERING_INTERVAL_SECONDS: u64 = 3_600;
  /// Leader writes a long-form report once a day.
  pub const REPORT_INTERVAL_SECONDS: u64 = 86_400;
  /// Single Python script run capped at 10 minutes.
  pub const PYTHON_TIMEOUT_SECONDS: u64 = 600;
  /// Every 10 failed Python attempts the runner pings the debate.
  pub const PYTHON_FEEDBACK_EVERY: u32 = 10;
  /// Whether convergence-based auto-pause is enabled by default.
  pub const AUTO_PAUSE_WHEN_CONVERGED: bool = false;
  /// Default wake-check cron (UTC): at minute 0 of every hour.
  pub const RESUME_SCHEDULE_CRON: &str = "0 * * * *";
  /// User-facing label for the default wake schedule.
  pub const RESUME_SCHEDULE_LABEL: &str = "Every hour";
}

/// Process-level configuration. Construct via [`AppConfig::default`]; the
/// values are fixed at compile time to match the container deployment.
#[derive(Debug, Clone)]
pub struct AppConfig {
  /// TCP socket the HTTP server binds to.
  pub bind_addr: SocketAddr,
  /// SQLite connection string. Always file-backed; the WAL journal lives in
  /// the same directory.
  pub database_url: String,
  /// Filesystem root used for per-room workspaces. The orchestrator creates
  /// `<data_root>/debate/<room-slug>/` as needed.
  pub data_root: PathBuf,
}

impl Default for AppConfig {
  fn default() -> Self {
    let bind_addr =
      SocketAddr::new(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)), 8080);
    let data_root = PathBuf::from(DEFAULT_DATA_ROOT);
    let database_url =
      format!("sqlite://{}", data_root.join("vemium.db").display());
    Self {
      bind_addr,
      database_url,
      data_root,
    }
  }
}
