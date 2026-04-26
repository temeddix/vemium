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
const MAX_TOKENS_PER_TURN: u32 = 8192;
const NON_FINAL_WORD_GUIDANCE: &str =
  include_str!("prompts/non_final_word_guidance.md");

const DATA_SCAVENGER_PROMPT: &str = include_str!("prompts/data_scavenger.md");
const MACRO_STRATEGIST_PROMPT: &str =
  include_str!("prompts/macro_strategist.md");
const QUANT_ENGINEER_PROMPT: &str = include_str!("prompts/quant_engineer.md");
const COMPLIANCE_LAWYER_PROMPT: &str =
  include_str!("prompts/compliance_lawyer.md");
const CHIEF_EDITOR_FINAL_REPORT_PROMPT: &str =
  include_str!("prompts/chief_editor_final_report.md");

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
  interval_seconds: u64,
  rounds: u32,
  run_forever: bool,
}

struct AgentTurnRequest<'a> {
  phase: &'a str,
  max_tokens: u32,
  persona: AgentPersona,
  discussion_log: &'a [(String, String)],
  use_web_search: bool,
}

const DEBATE_PERSONAS: [AgentPersona; 4] = [
  AgentPersona {
    name: "DataScavenger",
    system_prompt: DATA_SCAVENGER_PROMPT,
  },
  AgentPersona {
    name: "MacroStrategist",
    system_prompt: MACRO_STRATEGIST_PROMPT,
  },
  AgentPersona {
    name: "QuantEngineer",
    system_prompt: QUANT_ENGINEER_PROMPT,
  },
  AgentPersona {
    name: "ComplianceLawyer",
    system_prompt: COMPLIANCE_LAWYER_PROMPT,
  },
];

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

  let client = Client::new();
  let db = &state.db;

  let mut sequence = 0_u64;
  let mut discussion_log: Vec<(String, String)> = Vec::new();
  let mut round_index: u64 = 0;

  if run_context.run_forever {
    sequence = emit(
      db,
      &sender,
      run_id,
      sequence,
      "run_mode",
      None,
      "Run configured to continue indefinitely.",
    );
  }

  loop {
    if is_cancelled(state, run_id).await {
      update_status(state, run_id, RunStatus::Failed).await;
      return Ok(());
    }

    round_index = round_index.saturating_add(1);
    let round_label = if run_context.run_forever {
      format!("Debate round {round_index} started: proposal phase.")
    } else {
      format!(
        "Debate round {}/{} started: proposal phase.",
        round_index, run_context.rounds
      )
    };

    sequence = emit(
      db,
      &sender,
      run_id,
      sequence,
      "phase_started",
      None,
      &round_label,
    );

    for persona in &DEBATE_PERSONAS {
      let turn = request_agent_turn(
        client.clone(),
        state,
        &run_context,
        AgentTurnRequest {
          phase: "proposal",
          max_tokens: MAX_TOKENS_PER_TURN,
          persona: *persona,
          discussion_log: &discussion_log,
          use_web_search: true,
        },
      )
      .await
      .with_context(|| format!("failed proposal turn for {}", persona.name))?;

      sequence = emit(
        db,
        &sender,
        run_id,
        sequence,
        "agent_response_created",
        Some(persona.name),
        &turn,
      );
      discussion_log.push((persona.name.to_string(), turn));
      if is_cancelled(state, run_id).await {
        update_status(state, run_id, RunStatus::Failed).await;
        return Ok(());
      }
      sleep(Duration::from_secs(10)).await;
    }

    sequence = emit(
      db,
      &sender,
      run_id,
      sequence,
      "phase_started",
      None,
      "Round moved to critique phase.",
    );

    for persona in &DEBATE_PERSONAS {
      let turn = request_agent_turn(
        client.clone(),
        state,
        &run_context,
        AgentTurnRequest {
          phase: "critique",
          max_tokens: MAX_TOKENS_PER_TURN,
          persona: *persona,
          discussion_log: &discussion_log,
          use_web_search: false,
        },
      )
      .await
      .with_context(|| format!("failed critique turn for {}", persona.name))?;

      sequence = emit(
        db,
        &sender,
        run_id,
        sequence,
        "agent_response_revised",
        Some(persona.name),
        &turn,
      );
      discussion_log.push((persona.name.to_string(), turn));
      if is_cancelled(state, run_id).await {
        update_status(state, run_id, RunStatus::Failed).await;
        return Ok(());
      }
      sleep(Duration::from_secs(10)).await;
    }

    let reached_end =
      !run_context.run_forever && round_index >= u64::from(run_context.rounds);
    if reached_end {
      break;
    }

    if run_context.interval_seconds > 0 {
      let wait_message = format!(
        "Waiting {} seconds before next round.",
        run_context.interval_seconds
      );
      sequence = emit(
        db,
        &sender,
        run_id,
        sequence,
        "round_waiting",
        None,
        &wait_message,
      );
      sleep(Duration::from_secs(run_context.interval_seconds)).await;
    }
  }

  if run_context.run_forever {
    return Ok(());
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
      max_tokens: MAX_TOKENS_PER_TURN,
      persona: AgentPersona {
        name: "ChiefEditor",
        system_prompt: CHIEF_EDITOR_FINAL_REPORT_PROMPT,
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
    Some("ChiefEditor"),
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
  } else {
    NON_FINAL_WORD_GUIDANCE
  };

  let user_prompt = if transcript.is_empty() {
    format!(
      "Phase: {phase}.\nTopic: {topic}.\nGoal: {goal}.\n{instruction}{background}{response_guidance}",
      phase = request.phase,
      topic = run_context.topic,
      goal = run_context.goal,
      instruction = instruction_line,
      background = background_line,
      response_guidance = response_guidance,
    )
  } else {
    format!(
      "Phase: {phase}.\nTopic: {topic}.\nGoal: {goal}.\n{instruction}{background}Prior discussion:\n{transcript}\n\nRespond as {name}. {response_guidance}",
      phase = request.phase,
      topic = run_context.topic,
      goal = run_context.goal,
      instruction = instruction_line,
      background = background_line,
      name = request.persona.name,
      response_guidance = response_guidance,
    )
  };

  let request_body = AnthropicMessagesRequest {
    model: state.anthropic_model.as_ref().clone(),
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
      interval_seconds: run.interval_seconds,
      rounds: run.rounds,
      run_forever: run.run_forever,
    };
  }

  RunContext {
    topic: "general research".to_string(),
    goal:
      "Analyze the topic with evidence and produce a balanced recommendation."
        .to_string(),
    instruction: None,
    background: None,
    interval_seconds: 0,
    rounds: 1,
    run_forever: false,
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
