//! Provider client construction.
//!
//! Vemium currently supports two LLM provider backends, both of which speak
//! OpenAI Chat Completions over HTTP/SSE under the hood:
//!
//! - **OpenRouter** ([`rig::providers::openrouter`]) - first-class
//!   integration; honors OpenRouter-specific routing and accounting.
//! - **OpenAI-compatible** ([`rig::providers::openai`]) - caller-supplied
//!   `base_url`. Use this for Ollama (`http://localhost:11434/v1`),
//!   self-hosted vLLM, llama.cpp, Together, Fireworks, and friends.
//!
//! The runtime constructs a fresh [`rig::agent::Agent`] from one of these
//! clients per turn (cheap; the agent owns the persona prompt + tool set,
//! the underlying client is just an HTTP wrapper).

use crate::models::{ProviderConfig, ProviderKind};
use anyhow::{Context, Result, anyhow};
use rig::providers::{openai, openrouter};

/// Wraps the concrete [`rig`] client implied by a [`ProviderConfig`].
///
/// Cheap to clone - both inner clients are `Arc`-wrapped `reqwest::Client`s.
/// The runtime pattern-matches on the variant once per turn to call
/// `.agent(model)`; the resulting [`rig::agent::Agent`] is generic over the
/// provider's model type, so it cannot be unified into a single trait
/// object - hence the explicit two-variant enum here.
///
/// We use [`openai::CompletionsClient`] (Chat Completions) rather than the
/// default [`openai::Client`] (Responses API) so that the same code path
/// covers Ollama, vLLM, llama.cpp, and any other server speaking the
/// venerable `/v1/chat/completions` protocol.
#[derive(Clone)]
pub enum ChatClient {
  OpenRouter(openrouter::Client),
  OpenAiCompat(openai::CompletionsClient),
}

impl ChatClient {
  /// Builds a client from a [`ProviderConfig`]. Returns an error when the
  /// configuration is missing values that variant requires (e.g.,
  /// openai_compat without a `base_url`).
  pub fn from_config(config: &ProviderConfig) -> Result<Self> {
    match config.provider {
      ProviderKind::Openrouter => {
        let key = config
          .api_key
          .as_deref()
          .map(str::trim)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| anyhow!("openrouter provider requires api_key"))?;
        let client = openrouter::Client::new(key)
          .map_err(|e| anyhow!(e.to_string()))
          .context("failed to build openrouter client")?;
        Ok(ChatClient::OpenRouter(client))
      }
      ProviderKind::OpenaiCompat => {
        let base = config
          .base_url
          .as_deref()
          .map(str::trim)
          .filter(|s| !s.is_empty())
          .ok_or_else(|| anyhow!("openai_compat provider requires base_url"))?;
        let key = config.api_key.as_deref().unwrap_or("");
        let client = openai::CompletionsClient::builder()
          .base_url(base)
          .api_key(key)
          .build()
          .map_err(|e| anyhow!(e.to_string()))
          .context("failed to build openai_compat client")?;
        Ok(ChatClient::OpenAiCompat(client))
      }
    }
  }
}
