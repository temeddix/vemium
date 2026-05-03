//! Provider client construction.
//!
//! Every supported endpoint speaks the OpenAI Chat Completions wire format
//! over HTTP/SSE - OpenRouter, Ollama, vLLM, llama.cpp, DeepSeek's hosted
//! API, OpenAI itself, etc.
//!
//! We always use [`openai::CompletionsClient`] which targets
//! `/v1/chat/completions`. rig's `openrouter::Client` is designed
//! specifically for OpenRouter's hosted API and does not work reliably
//! when pointed at third-party endpoints, so we don't use it.
//!
//! [`ProviderConfig::reasoning_field`] records which response field the
//! upstream provider uses to emit chain-of-thought tokens (`delta.reasoning`
//! vs `delta.reasoning_content`). `CompletionsClient` parses
//! `delta.reasoning_content`; `delta.reasoning` servers (Ollama, llama.cpp,
//! OpenRouter) will work but their thinking traces won't be forwarded.

use crate::models::ProviderConfig;
use anyhow::{Context, Result, anyhow};
use rig::providers::openai;

/// Builds a chat completions client from a [`ProviderConfig`].
pub fn build_chat_client(
  config: &ProviderConfig,
) -> Result<openai::CompletionsClient> {
  let base = config.base_url.trim();
  if base.is_empty() {
    return Err(anyhow!("provider config requires base_url"));
  }
  let key = config.api_key.as_deref().unwrap_or("");
  openai::CompletionsClient::builder()
    .base_url(base)
    .api_key(key)
    .build()
    .map_err(|e| anyhow!(e.to_string()))
    .context("failed to build chat client")
}
