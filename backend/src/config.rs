use std::{env, net::SocketAddr};

use anyhow::{Result, anyhow};

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
      .map_err(|error| anyhow!("invalid BACKEND_HOST/BACKEND_PORT: {error}"))?;

    let anthropic_api_key = env::var("ANTHROPIC_API_KEY")
      .map_err(|_| anyhow!("ANTHROPIC_API_KEY is required"))?;
    let anthropic_model = env::var("ANTHROPIC_MODEL")
      .unwrap_or_else(|_| "claude-3-5-sonnet-latest".to_string());
    let database_url = env::var("DATABASE_URL")
      .unwrap_or_else(|_| "sqlite:///data/vemium.db".to_string());

    Ok(Self {
      bind_addr,
      anthropic_api_key,
      anthropic_model,
      database_url,
    })
  }
}
