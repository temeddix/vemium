use anyhow::{Context, Result};
use std::env;
use std::net::SocketAddr;

#[derive(Debug, Clone)]
pub struct AppConfig {
  pub bind_addr: SocketAddr,
  pub compat_api_url: String,
  pub compat_api_key: String,
  pub high_model: String,
  pub low_model: String,
  pub database_url: String,
}

impl AppConfig {
  pub fn from_env() -> Result<Self> {
    let host =
      env::var("BACKEND_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = env::var("BACKEND_PORT").unwrap_or_else(|_| "8080".to_string());
    let bind_addr: SocketAddr = format!("{host}:{port}")
      .parse()
      .context("invalid BACKEND_HOST/BACKEND_PORT")?;

    let compat_api_url = env::var("OPENAI_COMPAT_API_URL")
      .context("OPENAI_COMPAT_API_URL is required")?;
    let compat_api_key = env::var("OPENAI_COMPAT_API_KEY")
      .context("OPENAI_COMPAT_API_KEY is required")?;
    let high_model = env::var("HIGH_MODEL")
      .context("HIGH_MODEL is required")?;
    let low_model = env::var("LOW_MODEL")
      .context("LOW_MODEL is required")?;
    let database_url = "sqlite:///data/vemium.db".to_string();

    Ok(Self {
      bind_addr,
      compat_api_url,
      compat_api_key,
      high_model,
      low_model,
      database_url,
    })
  }
}
