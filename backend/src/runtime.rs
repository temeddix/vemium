use crate::app_state::AppState;
use crate::db;
use crate::error::ReportError;
use crate::models::{RunEvent, RunStatus};
use anyhow::{Context, anyhow};
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tokio::time::{Duration, sleep};
use uuid::Uuid;

const ANTHROPIC_MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const ANTHROPIC_BETA_WEB_SEARCH: &str = "web-search-2025-03-05";
const RESEARCH_MAX_TOKENS: u32 = 8192;
const CHAT_MAX_TOKENS: u32 = 512;
const REPORT_MAX_TOKENS: u32 = 4096;
const CHAT_INTERVAL_SECONDS: u64 = 5;

#[derive(Clone, Copy)]
struct AgentPersona {
  name: &'static str,
  system_prompt: &'static str,
}

#[derive(Clone)]
struct RunContext {
  topic: String,
  goal: String,
  instruction: Option<String>,
  background: Option<String>,
  discussion_cycles: u32,
}

struct AgentTurnRequest<'a> {
  phase: &'a str,
  model: &'a str,
  max_tokens: u32,
  persona: AgentPersona,
  discussion_log: &'a [(String, String)],
  use_web_search: bool,
}

const DEBATE_PERSONAS: [AgentPersona; 4] = [
  AgentPersona {
    name: "Data Scavenger",
    system_prompt: include_str!("prompts/data_scavenger.md"),
  },
  AgentPersona {
    name: "Macro Strategist",
    system_prompt: include_str!("prompts/macro_strategist.md"),
  },
  AgentPersona {
    name: "Quant Engineer",
    system_prompt: include_str!("prompts/quant_engineer.md"),
  },
  AgentPersona {
    name: "Compliance Lawyer",
    system_prompt: include_str!("prompts/compliance_lawyer.md"),
  },
];

const INTERNET_RESEARCHER: AgentPersona = AgentPersona {
  name: "Internet Researcher",
  system_prompt: include_str!("prompts/initial_internet_research.md"),
};

#[derive(Debug, Serialize)]
struct AnthropicTool {
  #[serde(rename = "type")]
  kind: &'static str,
  name: &'static str,
}

const WEB_SEARCH_TOOL: AnthropicTool = AnthropicTool {
  kind: "web_search_20250305",
  name: "web_search",
};

#[derive(Debug, Serialize)]
struct AnthropicMessagesRequest {
  model: String,
  max_tokens: u32,
  system: String,
  messages: Vec<AnthropicInputMessage>,
  #[serde(skip_serializing_if = "Vec::is_empty")]
  tools: Vec<AnthropicTool>,
}

#[derive(Debug, Serialize)]
struct AnthropicInputMessage {
  role: String,
  content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessagesResponse {
  content: Vec<AnthropicOutputBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum AnthropicOutputBlock {
  #[serde(rename = "text")]
  Text { text: String },
  #[serde(other)]
  Other,
}

pub fn spawn_run(state: AppState, run_id: Uuid) {
  tokio::spawn(async move {
    if run_orchestration(&state, run_id).await.report().is_none() {
      update_status(&state, run_id, RunStatus::Failed).await;
    }
  });
}

async fn run_orchestration(
  state: &AppState,
  run_id: Uuid,
) -> anyhow::Result<()> {
  update_status(state, run_id, RunStatus::Running).await;

  let sender = {
    let streams = state.run_streams.read().await;
    streams.get(&run_id).cloned()
  };

  let Some(sender) = sender else {
    tracing::warn!(run_id = %run_id, "missing sender for run");
    update_status(state, run_id, RunStatus::Failed).await;
    return Ok(());
  };

  let run_context = load_run_context(state, run_id).await;
  let high_model = state.anthropic_high_model.as_ref().clone();
  let low_model = state.anthropic_low_model.as_ref().clone();

  let client = Client::new();
  let db = &state.db;

  let mut sequence = 0_u64;
  let mut discussion_log: Vec<(String, String)> = Vec::new();
  sequence = emit(
    db,
    &sender,
    run_id,
    sequence,
    "phase_started",
    None,
    "Collecting internet research.",
  );

  let research = request_agent_turn(
    client.clone(),
    state,
    &run_context,
    AgentTurnRequest {
      phase: "initial_research",
      model: &high_model,
      max_tokens: RESEARCH_MAX_TOKENS,
      persona: INTERNET_RESEARCHER,
      discussion_log: &discussion_log,
      use_web_search: true,
    },
  )
  .await
  .context("failed initial research turn")?;

  sequence = emit(
    db,
    &sender,
    run_id,
    sequence,
    "initial_research",
    Some(INTERNET_RESEARCHER.name),
    &research,
  );
  discussion_log.push((INTERNET_RESEARCHER.name.to_string(), research));

  sequence = emit(
    db,
    &sender,
    run_id,
    sequence,
    "phase_started",
    None,
    "Starting short chat loop.",
  );

  let num_cycles = run_context.discussion_cycles.max(1);
  let total_turns = num_cycles * DEBATE_PERSONAS.len() as u32;
  for index in 0..total_turns {
    if is_cancelled(state, run_id).await {
      update_status(state, run_id, RunStatus::Failed).await;
      return Ok(());
    }

    let persona = DEBATE_PERSONAS[(index as usize) % DEBATE_PERSONAS.len()];
    let turn = request_agent_turn(
      client.clone(),
      state,
      &run_context,
      AgentTurnRequest {
        phase: "chat",
        model: &low_model,
        max_tokens: CHAT_MAX_TOKENS,
        persona,
        discussion_log: &discussion_log,
        use_web_search: false,
      },
    )
    .await
    .with_context(|| format!("failed short chat turn for {}", persona.name))?;

    sequence = emit(
      db,
      &sender,
      run_id,
      sequence,
      "agent_chat",
      Some(persona.name),
      &turn,
    );
    discussion_log.push((persona.name.to_string(), turn));

    if index + 1 < total_turns {
      sleep(Duration::from_secs(CHAT_INTERVAL_SECONDS)).await;
    }
  }

  sequence = emit(
    db,
    &sender,
    run_id,
    sequence,
    "phase_started",
    None,
    "Generating final report.",
  );

  let report = request_agent_turn(
    client,
    state,
    &run_context,
    AgentTurnRequest {
      phase: "final_report",
      model: &high_model,
      max_tokens: REPORT_MAX_TOKENS,
      persona: AgentPersona {
        name: "Chief Editor",
        system_prompt: include_str!("prompts/chief_editor_final_report.md"),
      },
      discussion_log: &discussion_log,
      use_web_search: true,
    },
  )
  .await
  .context("failed final report for ChiefEditor")?;

  sequence = emit(
    db,
    &sender,
    run_id,
    sequence,
    "final_report",
    Some("Chief Editor"),
    &report,
  );

  let _ = emit(
    db,
    &sender,
    run_id,
    sequence,
    "run_completed",
    None,
    "Run completed successfully.",
  );

  update_status(state, run_id, RunStatus::Completed).await;

  Ok(())
}

fn emit(
  db: &sqlx::SqlitePool,
  sender: &broadcast::Sender<RunEvent>,
  run_id: Uuid,
  previous_sequence: u64,
  event_type: &str,
  agent: Option<&str>,
  content: &str,
) -> u64 {
  let next_sequence = previous_sequence.saturating_add(1);
  let event = RunEvent {
    run_id,
    sequence: next_sequence,
    event_type: event_type.to_string(),
    agent: agent.map(std::string::ToString::to_string),
    content: content.to_string(),
    timestamp: Utc::now().to_rfc3339(),
  };

  let db_clone = db.clone();
  let event_clone = event.clone();
  tokio::spawn(async move {
    if let Err(error) = db::insert_event(&db_clone, &event_clone).await {
      tracing::warn!(run_id = %run_id, %error, "failed to persist event to database");
    }
  });

  if sender.send(event).is_err() {
    tracing::debug!(run_id = %run_id, "no websocket subscribers for event");
  }

  next_sequence
}

async fn request_agent_turn(
  client: Client,
  state: &AppState,
  run_context: &RunContext,
  request: AgentTurnRequest<'_>,
) -> anyhow::Result<String> {
  let transcript = request
    .discussion_log
    .iter()
    .map(|(agent, content)| format!("{agent}: {content}"))
    .collect::<Vec<String>>()
    .join("\n\n");

  let background_line = run_context
    .background
    .as_ref()
    .map(|v| format!("Background: {v}\n"))
    .unwrap_or_default();
  let instruction_line = run_context
    .instruction
    .as_ref()
    .map(|v| format!("Instruction: {v}\n"))
    .unwrap_or_default();

  let response_guidance = if request.phase == "final_report" {
    "Be thorough and comprehensive."
  } else if request.phase == "initial_research" {
    "Collect latest internet-backed facts and cite source names in concise bullets."
  } else {
    include_str!("prompts/non_final_word_guidance.md")
  };

  let length_guidance = if request.phase == "chat" {
    concat!(
      "Length guardrail: Keep the response concise ",
      "(about 180-220 words, up to 6 bullets). ",
      "Do not exceed the response token budget."
    )
  } else {
    "Length guardrail: Do not exceed the response token budget."
  };

  let user_prompt = if transcript.is_empty() {
    format!(
      "Phase: {phase}.\nTopic: {topic}.\nGoal: {goal}.\n{instruction}{background}{response_guidance}\n{length_guidance}",
      phase = request.phase,
      topic = run_context.topic,
      goal = run_context.goal,
      instruction = instruction_line,
      background = background_line,
      response_guidance = response_guidance,
      length_guidance = length_guidance,
    )
  } else {
    format!(
      "Phase: {phase}.\nTopic: {topic}.\nGoal: {goal}.\n{instruction}{background}Prior discussion:\n{transcript}\n\nRespond as {name}. {response_guidance}\n{length_guidance}",
      phase = request.phase,
      topic = run_context.topic,
      goal = run_context.goal,
      instruction = instruction_line,
      background = background_line,
      name = request.persona.name,
      response_guidance = response_guidance,
      length_guidance = length_guidance,
    )
  };

  let request_body = AnthropicMessagesRequest {
    model: request.model.to_string(),
    max_tokens: request.max_tokens,
    system: request.persona.system_prompt.to_string(),
    messages: vec![AnthropicInputMessage {
      role: "user".to_string(),
      content: user_prompt,
    }],
    tools: if request.use_web_search {
      vec![AnthropicTool {
        kind: WEB_SEARCH_TOOL.kind,
        name: WEB_SEARCH_TOOL.name,
      }]
    } else {
      vec![]
    },
  };

  let mut attempt = 0u32;
  loop {
    let mut req = client
      .post(ANTHROPIC_MESSAGES_URL)
      .header("x-api-key", state.anthropic_api_key.as_ref())
      .header("anthropic-version", ANTHROPIC_VERSION);
    if request.use_web_search {
      req = req.header("anthropic-beta", ANTHROPIC_BETA_WEB_SEARCH);
    }
    let response = req
      .json(&request_body)
      .send()
      .await
      .context("failed to send Anthropic request")?;

    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
      attempt += 1;
      if attempt > 5 {
        return Err(anyhow!(
          "Anthropic rate limit exceeded after {attempt} retries"
        ));
      }
      let wait = 30 * attempt;
      tracing::warn!(attempt, wait_secs = wait, "rate limited, retrying");
      sleep(Duration::from_secs(u64::from(wait))).await;
      continue;
    }

    if !response.status().is_success() {
      let status = response.status();
      let body = response
        .text()
        .await
        .unwrap_or_else(|_| "<unreadable response body>".to_string());
      return Err(anyhow!("Anthropic API error {status}: {body}"));
    }

    let payload: AnthropicMessagesResponse = response
      .json()
      .await
      .context("failed to decode Anthropic response")?;

    let text_blocks = payload
      .content
      .into_iter()
      .filter_map(|block| match block {
        AnthropicOutputBlock::Text { text } => {
          let trimmed = text.trim().to_string();
          if trimmed.is_empty() {
            None
          } else {
            Some(trimmed)
          }
        }
        AnthropicOutputBlock::Other => None,
      })
      .collect::<Vec<String>>();

    if text_blocks.is_empty() {
      return Err(anyhow!("Anthropic response contained no text block"));
    }

    return Ok(text_blocks.join("\n\n"));
  }
}

async fn load_run_context(state: &AppState, run_id: Uuid) -> RunContext {
  let runs = state.runs.read().await;
  if let Some(run) = runs.get(&run_id) {
    return RunContext {
      topic: run.topic.clone(),
      goal: run.goal.clone(),
      instruction: run.instruction.clone(),
      background: run.background.clone(),
      discussion_cycles: run.discussion_cycles,
    };
  }

  RunContext {
    topic: "general research".to_string(),
    goal:
      "Analyze the topic with evidence and produce a balanced recommendation."
        .to_string(),
    instruction: None,
    background: None,
    discussion_cycles: 1,
  }
}

async fn is_cancelled(state: &AppState, run_id: Uuid) -> bool {
  state.cancelled_runs.read().await.contains(&run_id)
}

async fn update_status(state: &AppState, run_id: Uuid, status: RunStatus) {
  let updated_at = Utc::now().to_rfc3339();
  {
    let mut runs = state.runs.write().await;
    if let Some(run) = runs.get_mut(&run_id) {
      run.status = status.clone();
      run.updated_at = updated_at.clone();
    }
  }
  if let Err(error) =
    db::update_run_status(&state.db, run_id, &status, &updated_at).await
  {
    tracing::warn!(run_id = %run_id, %error, "failed to persist status update to database");
  }

  if matches!(status, RunStatus::Completed | RunStatus::Failed) {
    let mut active_run_id = state.active_run_id.write().await;
    if active_run_id.as_ref() == Some(&run_id) {
      *active_run_id = None;
    }
  }
}
