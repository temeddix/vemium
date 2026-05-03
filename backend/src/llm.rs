//! Provider client construction.
//!
//! Every supported endpoint speaks the OpenAI Chat Completions wire format
//! over HTTP/SSE - OpenRouter, Ollama, vLLM, llama.cpp, DeepSeek's hosted
//! API, OpenAI itself, etc. The "compatibility" is loose, though: vendors
//! agree on the request shape and on the base response (`delta.content`,
//! `tool_calls`, `usage`), but each one extends the response with its own
//! flavor of streaming reasoning text.
//!
//! OpenAI Chat Completions itself has *no* reasoning text in the response
//! (o-series exposes reasoning only via the Responses API). The two vendor
//! extensions that matter in practice are:
//!
//! - `delta.reasoning` (+ `delta.reasoning_details[]`): OpenRouter,
//!   Ollama, llama.cpp.
//! - `delta.reasoning_content`: DeepSeek's hosted API, vLLM defaults,
//!   sglang.
//!
//! [`rig`] ships one provider module per dialect, so we dispatch on
//! [`ReasoningField`] when constructing the client. Once built, the rest of
//! the runtime is generic over the model type and treats both clients
//! uniformly.

use crate::models::{ProviderConfig, ReasoningField};
use anyhow::{Context, Result, anyhow};
use rig::providers::{openai, openrouter};

/// Wraps one of rig's two OpenAI Chat Completions-compatible client modules.
///
/// Variant names mirror the rig module being wrapped (not the upstream
/// vendor brand) - the user-facing concept of "which reasoning field is
/// expected" lives on [`ReasoningField`] in [`ProviderConfig`]. The mapping
/// happens once in [`ChatClient::from_config`].
///
/// We keep this as an enum (rather than a trait object) because rig fixes
/// each client's `CompletionModel` associated type at compile time and the
/// downstream stream loops are generic over `M`. Each match arm
/// monomorphizes the same generic function body, so the duplication is one
/// dispatch line per call site, not in the actual logic.
///
/// - [`Self::OpenRouter`] - reads `delta.reasoning`. Use for OpenRouter,
///   Ollama, llama.cpp.
/// - [`Self::OpenAi`] - reads `delta.reasoning_content`. Use for DeepSeek,
///   vLLM, sglang. Plain OpenAI Chat Completions is a strict subset and
///   simply emits no reasoning text on this code path.
#[derive(Clone)]
pub enum ChatClient {
  OpenRouter(openrouter::Client),
  OpenAi(openai::CompletionsClient),
}

impl ChatClient {
  /// Builds a client from a [`ProviderConfig`]. Both variants accept the
  /// same `base_url` + optional `api_key`; only the streaming-response
  /// parser differs, picked by [`ProviderConfig::reasoning_field`].
  pub fn from_config(config: &ProviderConfig) -> Result<Self> {
    let base = config.base_url.trim();
    if base.is_empty() {
      return Err(anyhow!("provider config requires base_url"));
    }
    let key = config.api_key.as_deref().unwrap_or("");
    match config.reasoning_field {
      ReasoningField::Reasoning => {
        let client = openrouter::Client::builder()
          .api_key(key)
          .base_url(base)
          .build()
          .map_err(|e| anyhow!(e.to_string()))
          .context("failed to build openrouter chat client")?;
        Ok(ChatClient::OpenRouter(client))
      }
      ReasoningField::ReasoningContent => {
        let client = openai::CompletionsClient::builder()
          .base_url(base)
          .api_key(key)
          .build()
          .map_err(|e| anyhow!(e.to_string()))
          .context("failed to build openai chat client")?;
        Ok(ChatClient::OpenAi(client))
      }
    }
  }
}
