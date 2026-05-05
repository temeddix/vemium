// Wire types matching the backend API. Shapes mirror the Rust models in
// `backend/src/models.rs` and `backend/src/streaming.rs` exactly; field
// names follow the camelCase convention emitted by serde.

/**
 * User-controlled lifecycle gate. `deactivated` is the strongest off-switch
 * in the system: while in this state the orchestrator does not advance
 * regardless of [`DebateState`]. Only the user (via the room menu) flips
 * this back to `active`.
 */
export type RoomState = "active" | "deactivated";
/**
 * Leader-controlled debate gate. Flipped by the leader's `pause_room` /
 * `resume_room` tools and by the auto-pause-on-converge path. Only
 * meaningful when [`RoomState`] is `active`.
 */
export type DebateState = "running" | "paused";
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
   * redacts this to `***` in every API response.
   */
  apiKey: string | null;
  /** Provider family. Defaults to `"ollama"` server-side when omitted. */
  apiType?: ApiType;
}

/**
 * Process-wide low/high tier configuration shared by every room. Edited via
 * the home-screen Settings page.
 */
export interface AppSettings {
  low: ProviderConfig;
  high: ProviderConfig;
  updatedAt: string;
}

export interface UpdateAppSettingsRequest {
  low?: ProviderConfig;
  high?: ProviderConfig;
}

/**
 * One entry returned by `POST /v1/providers/:tier/models`. The `id` is the
 * exact identifier the provider expects in subsequent chat calls (e.g.
 * `qwen3:14b`, `anthropic/claude-sonnet-4-6`).
 */
export interface ProviderModelOption {
  id: string;
}

export interface ProviderModelsResponse {
  models: ProviderModelOption[];
}

export interface Room {
  /**
   * Readable id in `xxx-xxxx-xxx` lowercase letter format. Used as the
   * room's primary key, the URL segment, and the workspace directory name.
   */
  code: string;
  topic: string;
  goal: string;
  instruction: string | null;
  roomState: RoomState;
  debateState: DebateState;
  chatIntervalSeconds: number;
  steeringIntervalSeconds: number;
  reportScheduleCron: string;
  reportScheduleLabel: string;
  pythonTimeoutSeconds: number;
  autoPauseWhenConverged: boolean;
  resumeScheduleCron: string;
  resumeScheduleLabel: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One finalized event row in a room's chat log. Chat-bubble kinds carry
 * the assistant's reply in `content` and any chain-of-thought trace in
 * `reasoning`. For `kind === "inline_note"` rows, `content` is the
 * always-visible label and `detail` is the click-to-reveal expansion;
 * `reasoning` is empty.
 *
 * Tool invocations live on their own `inline_note` rows now - they are
 * not threaded onto the assistant message that triggered them.
 */
export interface Message {
  /**
   * Database primary key. `null` only for in-memory drafts before they hit
   * the persistence layer; every row coming over the WebSocket carries an
   * `id` so the frontend (and the inline-note detail tool) can address it.
   */
  id: number | null;
  roomCode: string;
  sequence: number;
  kind: TurnKind;
  agent: string | null;
  content: string;
  reasoning: string;
  /** Click-to-reveal expansion for `inline_note` rows; empty otherwise. */
  detail: string;
  timestamp: string;
}

export interface RoomReport {
  id: number;
  roomCode: string;
  sequence: number;
  content: string;
  startedAt: string;
  completedAt: string | null;
  status: ReportStatus;
}

// -- WebSocket events -----------------------------------------------------

/**
 * Categorisation of a row in `room_events`. `agent_chat`, `leader_note`,
 * and `user_chat` render as full chat bubbles. `inline_note` is a
 * lightweight breadcrumb (dim text next to the author's avatar); its
 * `content` holds the always-visible label and `detail` holds the
 * click-to-reveal expansion.
 *
 * `user_chat` only ever appears on a finalized `Message` (humans don't
 * stream tokens, so there are no `user_chat` drafts).
 */
export type TurnKind =
  | "agent_chat"
  | "leader_note"
  | "user_chat"
  | "inline_note";

/** Subset of [`TurnKind`] that drafts can carry - there are no inline-note
 * or user drafts (inline notes are persisted directly without a draft
 * phase, and humans don't stream). */
export type DraftKind = "agent_chat" | "leader_note";

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

/** User-controlled gate flipped (active <-> deactivated). */
export interface WsRoomState {
  type: "roomState";
  state: RoomState;
}

/** Leader-controlled gate flipped (running <-> paused). */
export interface WsDebateState {
  type: "debateState";
  state: DebateState;
}

export interface WsDraftStarted {
  type: "draftStarted";
  turnId: string;
  agent: string;
  kind: DraftKind;
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

/**
 * A tool invocation began as part of this draft. Carries the tool name so
 * the UI can label the running spinner. Rig dispatches tools serially, so
 * at most one tool is running per draft at a time - the matching
 * `draftToolCompleted` clears the indicator.
 */
export interface WsDraftToolStarted {
  type: "draftToolStarted";
  turnId: string;
  tool: string;
}

/**
 * The current tool call finished. The persisted inline-note row arrives
 * separately as a `messageAdded` frame; this only clears the running-tool
 * indicator on the matching draft.
 */
export interface WsDraftToolCompleted {
  type: "draftToolCompleted";
  turnId: string;
  tool: string;
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
  | WsRoomState
  | WsDebateState
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
  topic: string;
  goal: string;
  instruction?: string | null;
  chatIntervalSeconds?: number;
  steeringIntervalSeconds?: number;
  reportScheduleCron?: string;
  reportScheduleLabel?: string;
  pythonTimeoutSeconds?: number;
  autoPauseWhenConverged?: boolean;
  resumeScheduleCron?: string;
  resumeScheduleLabel?: string;
}

export type UpdateRoomRequest = Partial<CreateRoomRequest>;

export interface CloneRoomRequest {
  includeHistory: boolean;
}

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
  kind: DraftKind;
  content: string;
  reasoning: string;
  /**
   * Name of the tool currently running on this draft, or `null` when the
   * model is producing text. Tools dispatch serially, so this is at most
   * one name; persisted inline-note rows for finished tool calls arrive
   * separately as `messageAdded` frames.
   */
  runningTool: string | null;
  status: "streaming" | "failed";
  error: string | null;
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
  /** Finalized rows, newest last. Includes inline-note breadcrumbs alongside
   * chat bubbles; the page partitions them at render time. Replaced
   * wholesale on snapshot. */
  messages: Message[];
  /** In-flight drafts, keyed by turnId. Usually 0 or 1 entries. */
  drafts: Draft[];
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

export interface SettingsEnvelope {
  settings: AppSettings;
}

/**
 * One regular file inside a room's workspace, returned by the
 * `/v1/rooms/:code/files` listing. Paths are forward-slash relative to the
 * room root regardless of platform.
 */
export interface WorkspaceFile {
  path: string;
  sizeBytes: number;
}

export interface WorkspaceFilesResponse {
  files: WorkspaceFile[];
}
