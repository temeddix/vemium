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
 * `resume_room` tools.
 */
export type DebateState = "running" | "paused";

export type ApiType = "ollama" | "openRouter";

export interface ProviderConfig {
  model: string;
  baseUrl: string;
  apiKey: string | null;
  apiType?: ApiType;
}

export interface AppSettings {
  low: ProviderConfig;
  high: ProviderConfig;
  updatedAt: string;
}

export interface UpdateAppSettingsRequest {
  low?: ProviderConfig;
  high?: ProviderConfig;
}

export interface ProviderModelOption {
  id: string;
}

export interface ProviderModelsResponse {
  models: ProviderModelOption[];
}

export interface Room {
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
  resumeScheduleCron: string;
  resumeScheduleLabel: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Categorisation of a row in the room timeline. Bubble kinds
 * (`agentChat`/`leaderNote`/`userChat`) render as full chat bubbles with
 * `content` always visible. Side-row kinds (`thinking`, `inlineNote`)
 * render as dim breadcrumbs next to the author's avatar; their `detail`
 * body shows inline only while `completedAt === null` (streaming) and is
 * hidden behind a click-to-open dialog once done.
 */
export type RoomEventKind =
  | "agent_chat"
  | "leader_note"
  | "user_chat"
  | "thinking"
  | "inline_note";

/**
 * One row in `room_events`. The same shape covers chat bubbles, thinking
 * rows, and tool inline notes - they only differ by `kind` and which of
 * `content` / `detail` carries the body. `completedAt === null` means the
 * row is still streaming (held in-memory on the server).
 */
export interface RoomEvent {
  id: number | null;
  roomCode: string;
  sequence: number;
  kind: RoomEventKind;
  agent: string | null;
  /** Bubble text for chat kinds; breadcrumb label for thinking / inline notes. */
  content: string;
  /** Click-to-reveal body for thinking / inline notes. Empty for bubbles. */
  detail: string;
  /** Wall-clock when this row was first created. */
  timestamp: string;
  /** Wall-clock when the row finished. `null` while streaming. */
  completedAt: string | null;
}

export interface RoomReport {
  id: number;
  roomCode: string;
  sequence: number;
  content: string;
  startedAt: string;
  completedAt: string | null;
}

// -- WebSocket events -----------------------------------------------------

/**
 * First frame on every connect. Carries the room state, the persisted
 * event log (only finalized rows; in-flight rows are not in the DB), and
 * the report list.
 */
export interface WsSnapshot {
  type: "snapshot";
  room: Room;
  events: RoomEvent[];
  reports: RoomReport[];
}

export interface WsRoomState {
  type: "roomState";
  state: RoomState;
}

export interface WsDebateState {
  type: "debateState";
  state: DebateState;
}

/**
 * A new row appeared. The full row is sent so the client renders it
 * without waiting for any deltas. May arrive already `done` (e.g. a
 * one-shot user message) or `streaming` (the body fills via subsequent
 * row deltas).
 */
export interface WsRowAdded {
  type: "rowAdded";
  event: RoomEvent;
}

/** Appends to a streaming row's `content` and/or `detail`. */
export interface WsRowDelta {
  type: "rowDelta";
  id: number;
  contentDelta?: string;
  detailDelta?: string;
}

/** Streaming row reached terminal state. Carries the final body. */
export interface WsRowFinished {
  type: "rowFinished";
  id: number;
  content: string;
  detail: string;
  completedAt: string;
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
  completedAt: string;
}

export type WsEvent =
  | WsSnapshot
  | WsRoomState
  | WsDebateState
  | WsRowAdded
  | WsRowDelta
  | WsRowFinished
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
  resumeScheduleCron?: string;
  resumeScheduleLabel?: string;
}

export type UpdateRoomRequest = Partial<CreateRoomRequest>;

export interface CloneRoomRequest {
  includeHistory: boolean;
}

// -- Live in-memory state -------------------------------------------------

export interface ReportBuffer {
  reportId: string;
  sequence: number;
  content: string;
  /** `null` while the report is still streaming (in-memory on the server). */
  completedAt: string | null;
}

/**
 * Aggregated per-room view that the dashboard renders. Built from the
 * snapshot's events plus any live row frames that arrive after subscribe.
 * Never sent over the wire.
 */
export interface RoomView {
  room: Room;
  /** Every row in the timeline, sorted by `sequence`. Streaming rows have
   * `completedAt === null` until the matching `rowFinished` frame arrives. */
  events: RoomEvent[];
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

export interface WorkspaceFile {
  path: string;
  sizeBytes: number;
}

export interface WorkspaceFilesResponse {
  files: WorkspaceFile[];
}
