// Wire types matching the backend API. Shapes mirror the Rust models in
// `backend/src/models.rs` and `backend/src/streaming.rs` exactly; field
// names follow the camelCase convention emitted by serde.

export type RoomStatus = "active" | "paused" | "failed";
export type ReportStatus = "streaming" | "done" | "failed";
/**
 * Which provider family a `ProviderConfig` targets. Selects the underlying
 * rig client at runtime: `ollama` uses the native `/api/chat` protocol,
 * `openrouter` uses OpenAI-compatible streaming and works against
 * OpenRouter (and any OpenAI-compatible endpoint that emits
 * `delta.reasoning`, e.g. llama.cpp).
 */
export type ApiType = "ollama" | "openrouter";

export interface ProviderConfig {
  model: string;
  /**
   * Endpoint root, always required. Examples:
   * - Ollama: `http://localhost:11434`
   * - OpenRouter: `https://openrouter.ai/api/v1`
   */
  baseUrl: string;
  /**
   * Bearer token. Required for OpenRouter; optional for Ollama. The backend
   * redacts this to `***xxxx` in every API response.
   */
  apiKey: string | null;
  /** Provider family. Defaults to `"ollama"` server-side when omitted. */
  apiType?: ApiType;
}

export interface Room {
  id: string;
  name: string;
  slug: string;
  topic: string;
  goal: string;
  instruction: string | null;
  background: string | null;
  status: RoomStatus;
  chatIntervalSeconds: number;
  evaluationIntervalSeconds: number;
  reportIntervalSeconds: number;
  pythonTimeoutSeconds: number;
  pythonFeedbackEvery: number;
  low: ProviderConfig;
  high: ProviderConfig;
  createdAt: string;
  updatedAt: string;
}

export type RoomEventKind =
  | "agent_chat"
  | "leader_note"
  | "tool_call"
  | "phase"
  | "system";

export interface RoomEvent {
  roomId: string;
  sequence: number;
  kind: RoomEventKind;
  agent: string | null;
  /** For `tool_call`, this is JSON-encoded `ToolCallRecord`; otherwise plain text. */
  content: string;
  timestamp: string;
}

export interface RoomReport {
  id: number;
  roomId: string;
  sequence: number;
  content: string;
  startedAt: string;
  completedAt: string | null;
  status: ReportStatus;
}

export interface ToolCallRecord {
  tool: string;
  args: unknown;
  ok: boolean;
  outputPreview: string;
  durationMs: number;
}

// -- WebSocket events -----------------------------------------------------

export type TurnKind = "agent_chat" | "leader_note";

export interface WsSnapshot {
  type: "snapshot";
  room: Room;
  events: RoomEvent[];
  reports: RoomReport[];
}

export interface WsRoomStatus {
  type: "roomStatus";
  status: RoomStatus;
}

export interface WsTurnStarted {
  type: "turnStarted";
  turnId: string;
  agent: string;
  kind: TurnKind;
}

export interface WsTurnToken {
  type: "turnToken";
  turnId: string;
  delta: string;
}

export interface WsTurnReasoningToken {
  type: "turnReasoningToken";
  turnId: string;
  delta: string;
}

export interface WsTurnCompleted {
  type: "turnCompleted";
  turnId: string;
  sequence: number;
  agent: string;
  content: string;
  timestamp: string;
}

export interface WsTurnFailed {
  type: "turnFailed";
  turnId: string;
  partial: string;
  error: string;
}

export interface WsToolStarted {
  type: "toolStarted";
  turnId: string;
  tool: string;
  argsPreview: string;
}

export interface WsToolCompleted {
  type: "toolCompleted";
  turnId: string;
  sequence: number;
  tool: string;
  ok: boolean;
  outputPreview: string;
  durationMs: number;
  timestamp: string;
}

export interface WsReportStarted {
  type: "reportStarted";
  reportId: string;
  sequence: number;
}

export interface WsReportToken {
  type: "reportToken";
  reportId: string;
  delta: string;
}

export interface WsReportCompleted {
  type: "reportCompleted";
  reportId: string;
  sequence: number;
  content: string;
  status: ReportStatus;
  completedAt: string;
}

export type WsEvent =
  | WsSnapshot
  | WsRoomStatus
  | WsTurnStarted
  | WsTurnToken
  | WsTurnReasoningToken
  | WsTurnCompleted
  | WsTurnFailed
  | WsToolStarted
  | WsToolCompleted
  | WsReportStarted
  | WsReportToken
  | WsReportCompleted;

// -- Request DTOs ---------------------------------------------------------

export interface CreateRoomRequest {
  name: string;
  topic: string;
  goal: string;
  instruction?: string | null;
  background?: string | null;
  chatIntervalSeconds?: number;
  evaluationIntervalSeconds?: number;
  reportIntervalSeconds?: number;
  pythonTimeoutSeconds?: number;
  pythonFeedbackEvery?: number;
  low: ProviderConfig;
  high: ProviderConfig;
}

export type UpdateRoomRequest =
  & Partial<
    Omit<CreateRoomRequest, "low" | "high">
  >
  & {
    low?: ProviderConfig;
    high?: ProviderConfig;
  };

// -- Live in-memory turn buffer -------------------------------------------

/**
 * One in-flight or completed turn keyed by the orchestrator's `turnId`.
 * The store builds these from streamed `WsEvent`s and the persisted
 * `RoomEvent` history, so the UI renders both replayed and live turns
 * uniformly.
 */
export interface TurnBuffer {
  turnId: string;
  agent: string;
  kind: TurnKind;
  content: string;
  /**
   * Live "thinking" trace streamed alongside `content` when the model emits
   * chain-of-thought separately. Empty for models that don't expose
   * reasoning, and lost on reconnect (not persisted).
   */
  reasoning: string;
  status: "streaming" | "completed" | "failed";
  sequence: number | null;
  timestamp: string | null;
  error: string | null;
}

export interface ToolCallEntry {
  /** Stable id; derived from `sequence` for completed calls or `turnId+tool` for in-flight ones. */
  id: string;
  turnId: string;
  sequence: number | null;
  tool: string;
  argsPreview: string;
  status: "running" | "ok" | "error";
  outputPreview: string | null;
  durationMs: number | null;
  timestamp: string | null;
}

export interface ReportBuffer {
  reportId: string;
  sequence: number;
  content: string;
  status: ReportStatus;
  completedAt: string | null;
}

/**
 * Aggregated per-room view that the dashboard renders. Built incrementally
 * from `WsEvent`s by the store; never sent over the wire.
 */
export interface RoomView {
  room: Room;
  /**
   * Ordered timeline of turns. Each turn aggregates the `turnStarted`,
   * `turnToken`s, and `turnCompleted` events that share the same `turnId`,
   * plus the historical `RoomEvent`s for completed turns reloaded from
   * the database snapshot.
   */
  turns: TurnBuffer[];
  /** Tool calls associated with any turn in this room, newest last. */
  toolCalls: ToolCallEntry[];
  /** All reports for this room, newest last. */
  reports: ReportBuffer[];
}

// -- Misc -----------------------------------------------------------------

export interface RoomsListResponse {
  rooms: Room[];
}

export interface RoomEnvelope {
  room: Room;
}

export interface ReportsListResponse {
  reports: RoomReport[];
}
