use crate::app_state::AppState;
use crate::db;
use crate::error::ReportError;
use crate::models::{RunEvent, RunKind, RunStatus};
use anyhow::{Context, anyhow};
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tokio::time::{Duration, sleep};
use uuid::Uuid;

const ANTHROPIC_MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MAX_TOKENS_PER_TURN: u32 = 700;

const DATA_SCAVENGER_PROMPT: &str = "You are DataScavenger, an internet-source analyst. Focus on concrete facts, catalyst events, source quality, and timeliness.";
const MACRO_STRATEGIST_PROMPT: &str = "You are MacroStrategist. Focus on macro context, ecosystem forces, and second-order impacts relevant to the topic.";
const QUANT_ENGINEER_PROMPT: &str = "You are QuantEngineer. Focus on structured reasoning, scenario comparison, and measurable assumptions.";
const COMPLIANCE_LAWYER_PROMPT: &str = "You are ComplianceLawyer. Focus on regulatory, legal, policy, and governance constraints and uncertainties.";
const CHIEF_EDITOR_PROMPT: &str = "You are ChiefEditor. Synthesize discussion into a coherent brief with practical recommendations, key risks, and confidence notes.";

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

const PERSONAS: [AgentPersona; 5] = [
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
  AgentPersona {
    name: "ChiefEditor",
    system_prompt: CHIEF_EDITOR_PROMPT,
  },
];

#[derive(Debug, Serialize)]
struct AnthropicMessagesRequest {
  model: String,
  max_tokens: u32,
  system: String,
  messages: Vec<AnthropicInputMessage>,
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

pub fn spawn_run(state: AppState, run_id: Uuid, kind: RunKind) {
  tokio::spawn(async move {
    if run_orchestration(&state, run_id, kind)
      .await
      .report()
      .is_none()
    {
      update_status(&state, run_id, RunStatus::Failed).await;
    }
  });
}

async fn run_orchestration(
  state: &AppState,
  run_id: Uuid,
  kind: RunKind,
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

  let run_context = load_run_context(state, run_id, &kind).await;

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

    for persona in first_round_personas() {
      let turn = request_agent_turn(
        client.clone(),
        state,
        &kind,
        &run_context,
        "proposal",
        *persona,
        &discussion_log,
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

    for persona in first_round_personas() {
      let turn = request_agent_turn(
        client.clone(),
        state,
        &kind,
        &run_context,
        "critique",
        *persona,
        &discussion_log,
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

  let summary = request_agent_turn(
    client,
    state,
    &kind,
    &run_context,
    "synthesis",
    chief_editor_persona(),
    &discussion_log,
  )
  .await
  .context("failed synthesis for ChiefEditor")?;

  sequence = emit(
    db,
    &sender,
    run_id,
    sequence,
    "synthesis_updated",
    Some("ChiefEditor"),
    &summary,
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
  kind: &RunKind,
  run_context: &RunContext,
  phase: &str,
  persona: AgentPersona,
  discussion_log: &[(String, String)],
) -> anyhow::Result<String> {
  let transcript = discussion_log
    .iter()
    .map(|(agent, content)| format!("{agent}: {content}"))
    .collect::<Vec<String>>()
    .join("\n\n");

  let run_type = match kind {
    RunKind::Discussion => "discussion",
    RunKind::WeeklyReport => "weekly_report",
  };

  let background_line = run_context
    .background
    .as_ref()
    .map(|value| format!("Background: {value}\n"))
    .unwrap_or_default();
  let instruction_line = run_context
    .instruction
    .as_ref()
    .map(|value| format!("Instruction: {value}\n"))
    .unwrap_or_default();

  let user_prompt = if transcript.is_empty() {
    format!(
      "Run kind: {run_type}.\nPhase: {phase}.\nTopic: {topic}.\nGoal: {goal}.\n{instruction}{background}Provide your contribution in under 180 words.",
      topic = run_context.topic,
      goal = run_context.goal,
      instruction = instruction_line,
      background = background_line
    )
  } else {
    format!(
      "Run kind: {run_type}.\nPhase: {phase}.\nTopic: {topic}.\nGoal: {goal}.\n{instruction}{background}Prior discussion:\n{transcript}\n\nRespond as {name} in under 180 words.",
      topic = run_context.topic,
      goal = run_context.goal,
      instruction = instruction_line,
      background = background_line,
      name = persona.name
    )
  };

  let request_body = AnthropicMessagesRequest {
    model: state.anthropic_model.as_ref().clone(),
    max_tokens: MAX_TOKENS_PER_TURN,
    system: persona.system_prompt.to_string(),
    messages: vec![AnthropicInputMessage {
      role: "user".to_string(),
      content: user_prompt,
    }],
  };

  let response = client
    .post(ANTHROPIC_MESSAGES_URL)
    .header("x-api-key", state.anthropic_api_key.as_ref())
    .header("anthropic-version", ANTHROPIC_VERSION)
    .json(&request_body)
    .send()
    .await
    .context("failed to send Anthropic request")?;

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

  let text = payload
    .content
    .into_iter()
    .find_map(|block| match block {
      AnthropicOutputBlock::Text { text } => Some(text),
      AnthropicOutputBlock::Other => None,
    })
    .ok_or_else(|| anyhow!("Anthropic response contained no text block"))?;

  Ok(text.trim().to_string())
}

fn first_round_personas() -> &'static [AgentPersona] {
  &PERSONAS[..PERSONAS.len().saturating_sub(1)]
}

fn chief_editor_persona() -> AgentPersona {
  PERSONAS[PERSONAS.len().saturating_sub(1)]
}

async fn load_run_context(
  state: &AppState,
  run_id: Uuid,
  kind: &RunKind,
) -> RunContext {
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
    goal: default_goal_for_kind(kind).to_string(),
    instruction: None,
    background: None,
    interval_seconds: 0,
    rounds: 1,
    run_forever: false,
  }
}

fn default_goal_for_kind(kind: &RunKind) -> &'static str {
  match kind {
    RunKind::Discussion => {
      "Analyze the topic with evidence and provide balanced recommendations."
    }
    RunKind::WeeklyReport => {
      "Produce a concise weekly report with major developments, risks, and next actions."
    }
  }
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
