use anyhow::{Context, Result};
use std::env;
use std::net::SocketAddr;

#[derive(Debug, Clone)]
pub struct AppConfig {
  pub bind_addr: SocketAddr,
  pub anthropic_api_key: String,
  pub anthropic_model: String,
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

    let anthropic_api_key =
      env::var("ANTHROPIC_API_KEY").context("ANTHROPIC_API_KEY is required")?;
    let anthropic_model = "claude-sonnet-4-6".to_string();
    let database_url = "sqlite:///data/vemium.db".to_string();

    Ok(Self {
      bind_addr,
      anthropic_api_key,
      anthropic_model,
      database_url,
    })
  }
}
