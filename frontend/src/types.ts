// Wire types matching the backend API. Shapes mirror the Rust models in
// `backend/src/models.rs` and `backend/src/streaming.rs` exactly; field
// names follow the camelCase convention emitted by serde.

export type RoomStatus = "active" | "paused" | "failed";
export type ReportStatus = "streaming" | "done" | "failed";
/**
 * Which provider family a `ProviderConfig` targets. Selects the underlying
 * rig client at runtime: `ollama` uses the native `/api/chat` protocol,
 * `openRouter` uses OpenAI-compatible streaming and works against
 * OpenRouter (and any OpenAI-compatible endpoint that emits
 * `delta.reasoning`, e.g. llama.cpp).
 */
export type ApiType = "ollama" | "openRouter";

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
  steeringIntervalSeconds: number;
  reportIntervalSeconds: number;
  pythonTimeoutSeconds: number;
  autoPauseWhenConverged: boolean;
  resumeScheduleCron: string;
  resumeScheduleLabel: string;
  low: ProviderConfig;
  high: ProviderConfig;
  createdAt: string;
  updatedAt: string;
}

/**
 * One finalized message in a room's chat log. Reasoning trace and the list
 * of tool calls invoked during the turn are inline on the same record;
 * there is no separate "tool_call" event type any more.
 */
export interface Message {
  roomId: string;
  sequence: number;
  kind: TurnKind;
  agent: string | null;
  content: string;
  reasoning: string;
  toolCalls: ToolCallRecord[];
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

/**
 * All kinds participate in the LLM-visible transcript and render as message
 * bubbles. `user_chat` only ever appears on a finalized `Message` (humans
 * don't stream tokens, so there are no `user_chat` drafts).
 */
export type TurnKind = "agent_chat" | "leader_note" | "user_chat";

/**
 * First frame on every connect. Carries the room state and the persisted
 * message log; in-flight drafts are surfaced separately via `DraftStarted`
 * frames replayed by the server immediately after subscribe.
 */
export interface WsSnapshot {
  type: "snapshot";
  room: Room;
  messages: Message[];
  reports: RoomReport[];
}

export interface WsRoomStatus {
  type: "roomStatus";
  status: RoomStatus;
}

export interface WsInlineNote {
  type: "inlineNote";
  author: string;
  text: string;
  detail: string;
  timestamp: string;
}

export interface WsDraftStarted {
  type: "draftStarted";
  turnId: string;
  agent: string;
  kind: TurnKind;
}

export interface WsDraftText {
  type: "draftText";
  turnId: string;
  delta: string;
}

export interface WsDraftReasoning {
  type: "draftReasoning";
  turnId: string;
  delta: string;
}

export interface WsDraftToolStarted {
  type: "draftToolStarted";
  turnId: string;
  callId: string;
  tool: string;
  argsPreview: string;
}

export interface WsDraftToolCompleted {
  type: "draftToolCompleted";
  turnId: string;
  callId: string;
  tool: string;
  ok: boolean;
  outputPreview: string;
  durationMs: number;
}

export interface WsDraftFailed {
  type: "draftFailed";
  turnId: string;
  error: string;
}

/**
 * Authoritative finalization. The frontend retires the matching draft (if
 * any) and appends `message` to the chat log.
 */
export interface WsMessageAdded {
  type: "messageAdded";
  turnId: string;
  message: Message;
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
  | WsInlineNote
  | WsDraftStarted
  | WsDraftText
  | WsDraftReasoning
  | WsDraftToolStarted
  | WsDraftToolCompleted
  | WsDraftFailed
  | WsMessageAdded
  | WsReportStarted
  | WsReportToken
  | WsReportCompleted;

// -- Request DTOs ---------------------------------------------------------

export interface CreateMessageRequest {
  content: string;
}

export interface CreateRoomRequest {
  name: string;
  topic: string;
  goal: string;
  instruction?: string | null;
  background?: string | null;
  chatIntervalSeconds?: number;
  steeringIntervalSeconds?: number;
  reportIntervalSeconds?: number;
  pythonTimeoutSeconds?: number;
  autoPauseWhenConverged?: boolean;
  resumeScheduleCron?: string;
  resumeScheduleLabel?: string;
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

// -- Live in-memory state -------------------------------------------------

/**
 * A turn that's currently being produced by the model. Built up from
 * `Draft*` WS frames, retired when the matching `MessageAdded` arrives.
 * Drafts are purely transient - they're never persisted and they don't
 * survive reconnects intact (a draft already in-flight at connect time is
 * surfaced via the server's `DraftStarted` replay, but its accumulated
 * text starts empty and only fills with whatever tokens arrive after).
 */
export interface Draft {
  turnId: string;
  agent: string;
  kind: TurnKind;
  content: string;
  reasoning: string;
  toolCalls: DraftToolCall[];
  status: "streaming" | "failed";
  error: string | null;
}

export interface DraftToolCall {
  callId: string;
  tool: string;
  argsPreview: string;
  status: "running" | "ok" | "error";
  outputPreview: string | null;
  durationMs: number | null;
}

export interface ReportBuffer {
  reportId: string;
  sequence: number;
  content: string;
  status: ReportStatus;
  completedAt: string | null;
}

/**
 * Aggregated per-room view that the dashboard renders. Built from the
 * snapshot's `messages` (authoritative) plus live WS draft / message /
 * report frames. Never sent over the wire.
 */
export interface RoomView {
  room: Room;
  /** Finalized messages, newest last. Replaced wholesale on snapshot. */
  messages: Message[];
  /** In-flight drafts, keyed by turnId. Usually 0 or 1 entries. */
  drafts: Draft[];
  /** All reports for this room, newest last. */
  reports: ReportBuffer[];
  /** Non-bubble short notes rendered next to the author's avatar. */
  inlineNotes: Array<
    { author: string; text: string; detail: string; timestamp: string }
  >;
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
