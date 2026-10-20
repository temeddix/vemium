// Wire types matching the backend API. Shapes mirror the Rust models in
// `backend/src/models.rs` and `backend/src/streaming.rs` exactly; field
// names follow the camelCase convention emitted by serde.

/**
 * User-controlled lifecycle gate. `DEACTIVATED` is the strongest off-switch
 * in the system: while in this state the orchestrator does not advance
 * regardless of [`DebateState`]. Only the user (via the room menu) flips
 * this back to `ACTIVE`.
 */
export type RoomState = "ACTIVE" | "DEACTIVATED";

/**
 * Leader-controlled debate gate. Flipped by the leader's `pause_room` /
 * `resume_room` tools.
 */
export type DebateState = "RUNNING" | "PAUSED";

export type ApiType = "OLLAMA" | "OPEN_ROUTER" | "OPEN_AI";

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
 * (`AGENT_CHAT`/`LEADER_NOTE`/`USER_CHAT`) render as full chat bubbles with
 * `content` always visible. Side-row kinds (`THINKING`, `INLINE_NOTE`)
 * render as dim breadcrumbs next to the author's avatar; their `detail`
 * body shows inline only while `status === "streaming"` and is hidden
 * behind a click-to-open dialog once `done`.
 */
export type RoomEventKind =
  | "AGENT_CHAT"
  | "LEADER_NOTE"
  | "USER_CHAT"
  | "THINKING"
  | "INLINE_NOTE"
  | "SUMMARY";

/**
 * One row in `room_events`. The same shape covers chat bubbles, thinking
 * rows, and tool inline notes - they only differ by `kind` and which of
 * `content` / `detail` carries the body.
 *
 * `completedAt === null` means the row is still streaming. Once set,
 * `success` distinguishes a clean finish (`true`) from a failure (`false`).
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
  /** `true` once the row finished successfully; `false` while streaming or failed. */
  success: boolean;
  /** Wall-clock when this row was first inserted. */
  timestamp: string;
  /** Wall-clock when the row finished streaming. `null` while streaming. */
  completedAt: string | null;
}

export interface RoomReport {
  id: number;
  roomCode: string;
  sequence: number;
  content: string;
  startedAt: string;
  completedAt: string | null;
  success: boolean;
}

// -- WebSocket events -----------------------------------------------------

/**
 * First frame on every connect. Carries the room state, the persisted
 * event log (including any rows still streaming - their `completedAt` is
 * `null` and clients reattach to them with subsequent row deltas),
 * and the report list.
 */
export interface WsSnapshot {
  type: "SNAPSHOT";
  room: Room;
  events: RoomEvent[];
  reports: RoomReport[];
}

export interface WsRoomState {
  type: "ROOM_STATE";
  state: RoomState;
}

export interface WsDebateState {
  type: "DEBATE_STATE";
  state: DebateState;
}

/**
 * A new row appeared. The full row is sent so the client renders it
 * without waiting for any deltas. May arrive already finished (e.g. a
 * one-shot user message) or still streaming (`completedAt === null`).
 */
export interface WsRowAdded {
  type: "ROW_ADDED";
  event: RoomEvent;
}

/** Appends to a streaming row's `content` and/or `detail`. */
export interface WsRowDelta {
  type: "ROW_DELTA";
  id: number;
  contentDelta?: string;
  detailDelta?: string;
}

/** Streaming row reached terminal state. Carries the final body. */
export interface WsRowFinished {
  type: "ROW_FINISHED";
  id: number;
  content: string;
  detail: string;
  success: boolean;
  completedAt: string;
}

export interface WsReportStarted {
  type: "REPORT_STARTED";
  reportId: string;
  sequence: number;
}

export interface WsReportToken {
  type: "REPORT_TOKEN";
  reportId: string;
  delta: string;
}

export interface WsReportCompleted {
  type: "REPORT_COMPLETED";
  reportId: string;
  sequence: number;
  content: string;
  success: boolean;
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
  instruction: string | null;
  chatIntervalSeconds?: number;
  steeringIntervalSeconds?: number;
  reportScheduleCron?: string;
  reportScheduleLabel?: string;
  pythonTimeoutSeconds?: number;
  resumeScheduleCron?: string;
  resumeScheduleLabel?: string;
}

/** Every editable room field; the settings dialog sends them all. */
export interface UpdateRoomRequest {
  topic: string;
  goal: string;
  instruction: string | null;
  chatIntervalSeconds: number;
  steeringIntervalSeconds: number;
  reportScheduleCron: string;
  reportScheduleLabel: string;
  pythonTimeoutSeconds: number;
  resumeScheduleCron: string;
  resumeScheduleLabel: string;
}

// -- Live in-memory state -------------------------------------------------

export interface ReportBuffer {
  reportId: string;
  sequence: number;
  content: string;
  success: boolean;
  completedAt: string | null;
}

/**
 * Aggregated per-room view that the dashboard renders. Built from the
 * snapshot's events plus any live row frames that arrive after subscribe.
 * Never sent over the wire.
 */
export interface RoomView {
  room: Room;
  /** Every row in the timeline, sorted by `sequence`. Includes streaming
   * rows: their `completedAt` is `null` until the matching `rowFinished`
   * frame arrives. */
  events: RoomEvent[];
  reports: ReportBuffer[];
}

// -- Misc -----------------------------------------------------------------

export interface RoomsListResponse {
  rooms: Room[];
}

/** A single room, as the room endpoints answer and the room dialogs announce. */
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

/** The room-state answer of the activate and deactivate endpoints. */
export interface RoomStateResponse {
  roomState: RoomState;
}

/** The single-event answer of the room event endpoint. */
export interface RoomEventEnvelope {
  event: RoomEvent;
}

// -- Type guards ----------------------------------------------------------
//
// Responses are parsed as `unknown` and narrowed here before use. The
// backend is the only sender, so each guard checks the fields the UI keys
// on rather than every nested value.

/** Whether a value is a non-null object, so its fields can be read. */
function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** Whether a value is a list whose every item passes `isItem`. */
function isListOf<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every((item) => isItem(item));
}

/** Whether a value is one of the given string literals. */
function isOneOf<T extends string>(value: unknown, options: T[]): value is T {
  return (
    typeof value === "string" && options.some((option) => option === value)
  );
}

/** Whether a value is a `RoomState`. */
export function isRoomState(value: unknown): value is RoomState {
  return isOneOf(value, ["ACTIVE", "DEACTIVATED"]);
}

/** Whether a value is a `Room`. */
export function isRoom(value: unknown): value is Room {
  return (
    isObject(value) &&
    "code" in value &&
    typeof value.code === "string" &&
    "topic" in value &&
    typeof value.topic === "string" &&
    "roomState" in value &&
    isRoomState(value.roomState) &&
    "debateState" in value &&
    isOneOf(value.debateState, ["RUNNING", "PAUSED"])
  );
}

/** Whether a value is a `RoomEvent`. */
export function isRoomEvent(value: unknown): value is RoomEvent {
  return (
    isObject(value) &&
    "sequence" in value &&
    typeof value.sequence === "number" &&
    "kind" in value &&
    isOneOf(value.kind, [
      "AGENT_CHAT",
      "LEADER_NOTE",
      "USER_CHAT",
      "THINKING",
      "INLINE_NOTE",
      "SUMMARY",
    ]) &&
    "content" in value &&
    typeof value.content === "string"
  );
}

/** Whether a value is a `ProviderConfig`. */
function isProviderConfig(value: unknown): value is ProviderConfig {
  return (
    isObject(value) &&
    "model" in value &&
    typeof value.model === "string" &&
    "baseUrl" in value &&
    typeof value.baseUrl === "string"
  );
}

/** Whether a value is a `RoomsListResponse`. */
export function isRoomsListResponse(
  value: unknown,
): value is RoomsListResponse {
  return isObject(value) && "rooms" in value && isListOf(value.rooms, isRoom);
}

/** Whether a value is a `RoomEnvelope`. */
export function isRoomEnvelope(value: unknown): value is RoomEnvelope {
  return isObject(value) && "room" in value && isRoom(value.room);
}

/** Whether a value is a `RoomEventEnvelope`. */
export function isRoomEventEnvelope(
  value: unknown,
): value is RoomEventEnvelope {
  return isObject(value) && "event" in value && isRoomEvent(value.event);
}

/** Whether a value is a `RoomStateResponse`. */
export function isRoomStateResponse(
  value: unknown,
): value is RoomStateResponse {
  return (
    isObject(value) && "roomState" in value && isRoomState(value.roomState)
  );
}

/** Whether a value is a `SettingsEnvelope`. */
export function isSettingsEnvelope(value: unknown): value is SettingsEnvelope {
  return (
    isObject(value) &&
    "settings" in value &&
    isObject(value.settings) &&
    "low" in value.settings &&
    isProviderConfig(value.settings.low) &&
    "high" in value.settings &&
    isProviderConfig(value.settings.high)
  );
}

/** Whether a value is a `ProviderModelOption`. */
function isProviderModelOption(value: unknown): value is ProviderModelOption {
  return isObject(value) && "id" in value && typeof value.id === "string";
}

/** Whether a value is a `ProviderModelsResponse`. */
export function isProviderModelsResponse(
  value: unknown,
): value is ProviderModelsResponse {
  return (
    isObject(value) &&
    "models" in value &&
    isListOf(value.models, isProviderModelOption)
  );
}

/** Whether a value is a `WorkspaceFile`. */
function isWorkspaceFile(value: unknown): value is WorkspaceFile {
  return (
    isObject(value) &&
    "path" in value &&
    typeof value.path === "string" &&
    "sizeBytes" in value &&
    typeof value.sizeBytes === "number"
  );
}

/** Whether a value is a `WorkspaceFilesResponse`. */
export function isWorkspaceFilesResponse(
  value: unknown,
): value is WorkspaceFilesResponse {
  return (
    isObject(value) &&
    "files" in value &&
    isListOf(value.files, isWorkspaceFile)
  );
}

/** Every `type` tag the backend's `WsEvent` frames carry. */
const WS_EVENT_TYPES: WsEvent["type"][] = [
  "SNAPSHOT",
  "ROOM_STATE",
  "DEBATE_STATE",
  "ROW_ADDED",
  "ROW_DELTA",
  "ROW_FINISHED",
  "REPORT_STARTED",
  "REPORT_TOKEN",
  "REPORT_COMPLETED",
];

/**
 * Whether a parsed frame is a `WsEvent`: an object whose `type` is one of
 * the tags the backend sends. The tag stands for the rest of the shape.
 */
export function isWsEvent(value: unknown): value is WsEvent {
  return (
    isObject(value) && "type" in value && isOneOf(value.type, WS_EVENT_TYPES)
  );
}

/** Whether a value is an error body, `{ "error": "..." }`. */
export function isErrorBody(value: unknown): value is ErrorBody {
  return isObject(value) && "error" in value && typeof value.error === "string";
}

/** An error answer's body. */
export interface ErrorBody {
  error: string;
}
