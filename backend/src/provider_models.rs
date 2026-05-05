//! Fetch the live model list from a configured LLM provider.
//!
//! Used by `POST /v1/providers/:tier/models` so the settings UI can show a
//! dropdown of installed models (Ollama) or available models (OpenRouter)
//! instead of asking the user to remember the exact identifier. The
//! fetcher mirrors the per-provider URL conventions used by
//! [`crate::llm::build_chat_client`]:
//!
//! - Ollama: `GET {base_url}/api/tags`, returning `models[].name`.
//! - OpenRouter (and OpenAI-compatible servers): `GET {base_url}/models`,
//!   returning `data[].id`. The bearer token is forwarded when present;
//!   public listings (e.g. OpenRouter itself) accept the call without one.

use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use serde::Deserialize;

use crate::models::{ApiType, ProviderConfig};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Deserialize)]
struct OllamaTagsResponse {
  #[serde(default)]
  models: Vec<OllamaTag>,
}

#[derive(Deserialize)]
struct OllamaTag {
  #[serde(default)]
  name: String,
}

#[derive(Deserialize)]
struct OpenAiModelsResponse {
  #[serde(default)]
  data: Vec<OpenAiModel>,
}

#[derive(Deserialize)]
struct OpenAiModel {
  #[serde(default)]
  id: String,
}

/// Fetches the list of model identifiers exposed by `config`'s provider.
/// Returns the IDs in the order the provider emitted them, with empty
/// entries filtered out.
pub async fn fetch_provider_models(
  config: &ProviderConfig,
) -> Result<Vec<String>> {
  let base = config.base_url.trim();
  if base.is_empty() {
    bail!("base_url is required");
  }
  let client = reqwest::Client::builder()
    .timeout(REQUEST_TIMEOUT)
    .build()
    .map_err(|e| anyhow!(e.to_string()))
    .context("failed to build HTTP client")?;

  match config.api_type {
    ApiType::Ollama => fetch_ollama_models(&client, base).await,
    ApiType::OpenRouter => {
      let api_key = config
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty());
      fetch_openai_compatible_models(&client, base, api_key).await
    }
  }
}

async fn fetch_ollama_models(
  client: &reqwest::Client,
  base: &str,
) -> Result<Vec<String>> {
  // Match `OllamaChatClient::new`: native API lives at the server root, but
  // some users paste an OpenAI-compat `/v1` URL. Strip both the trailing
  // slash and a `/v1` suffix so either works.
  let base = base.trim_end_matches('/');
  let base = base.strip_suffix("/v1").unwrap_or(base);
  let url = format!("{base}/api/tags");

  let response = client
    .get(&url)
    .send()
    .await
    .map_err(|e| anyhow!(e.to_string()))
    .with_context(|| format!("GET {url}"))?;
  let status = response.status();
  if !status.is_success() {
    let body = response.text().await.unwrap_or_default();
    bail!("Ollama tags endpoint returned {status}: {}", body.trim());
  }
  let payload: OllamaTagsResponse = response
    .json()
    .await
    .map_err(|e| anyhow!(e.to_string()))
    .context("Ollama tags response was not valid JSON")?;
  Ok(
    payload
      .models
      .into_iter()
      .map(|tag| tag.name)
      .filter(|name| !name.is_empty())
      .collect(),
  )
}

async fn fetch_openai_compatible_models(
  client: &reqwest::Client,
  base: &str,
  api_key: Option<&str>,
) -> Result<Vec<String>> {
  let base = base.trim_end_matches('/');
  let url = format!("{base}/models");
  let mut request = client.get(&url);
  if let Some(key) = api_key {
    request = request.bearer_auth(key);
  }
  let response = request
    .send()
    .await
    .map_err(|e| anyhow!(e.to_string()))
    .with_context(|| format!("GET {url}"))?;
  let status = response.status();
  if !status.is_success() {
    let body = response.text().await.unwrap_or_default();
    bail!("Models endpoint returned {status}: {}", body.trim());
  }
  let payload: OpenAiModelsResponse = response
    .json()
    .await
    .map_err(|e| anyhow!(e.to_string()))
    .context("models response was not valid JSON")?;
  Ok(
    payload
      .data
      .into_iter()
      .map(|model| model.id)
      .filter(|id| !id.is_empty())
      .collect(),
  )
}
