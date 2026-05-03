import { BACKEND_BASE_URL } from "@/app/config";
import type {
  CreateRoomRequest,
  ReportBuffer,
  Room,
  RoomEvent,
  RoomEventKind,
  RoomReport,
  RoomsListResponse,
  RoomStatus,
  RoomView,
  ToolCallEntry,
  ToolCallRecord,
  TurnBuffer,
  UpdateRoomRequest,
  WsEvent,
} from "@/app/types";
import { RoomClient } from "./room-client.ts";

type Listener = () => void;

/**
 * Application-wide state shape exposed to web components. The store keeps
 * one `RoomView` per known room, the id of the currently selected room
 * (drives the detail pane), and connection status for the live WebSocket.
 */
export interface DashboardState {
  rooms: Room[];
  currentRoomId: string | null;
  views: Record<string, RoomView>;
  wsConnected: boolean;
  reconnectAttempt: number;
  errorMessage: string | null;
  isCreatingRoom: boolean;
}

const INITIAL_STATE: DashboardState = {
  rooms: [],
  currentRoomId: null,
  views: {},
  wsConnected: false,
  reconnectAttempt: 0,
  errorMessage: null,
  isCreatingRoom: false,
};

/**
 * The dashboard store is the single source of truth for the UI. Web
 * components subscribe via `subscribe()` and read with `getState()`. The
 * store owns one `RoomClient` and re-targets it whenever the user selects
 * a different room.
 */
export class DashboardStore {
  #state: DashboardState = INITIAL_STATE;
  #listeners = new Set<Listener>();
  #client: RoomClient;

  constructor() {
    this.#client = new RoomClient({
      onConnected: (): void => {
        this.#patch({ wsConnected: true, reconnectAttempt: 0 });
      },
      onDisconnected: (attempt: number): void => {
        this.#patch({ wsConnected: false, reconnectAttempt: attempt });
      },
      onEvent: (event: WsEvent): void => {
        this.#applyEvent(event);
      },
      onError: (message: string): void => {
        this.#patch({ errorMessage: message });
      },
    });
    void this.loadRooms();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  getState(): DashboardState {
    return this.#state;
  }

  dispose(): void {
    this.#client.disconnect();
    this.#listeners.clear();
  }

  // -- Network ------------------------------------------------------------

  async loadRooms(): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/rooms`);
      if (!response.ok) {
        this.#patch({ errorMessage: "Failed to load rooms." });
        return;
      }
      const payload = (await response.json()) as RoomsListResponse;
      this.#patch({ rooms: payload.rooms });
      // Auto-select the first room on first load.
      if (this.#state.currentRoomId === null && payload.rooms.length > 0) {
        this.selectRoom(payload.rooms[0].id);
      }
    } catch {
      this.#patch({ errorMessage: "Network error while loading rooms." });
    }
  }

  selectRoom(roomId: string): void {
    if (this.#state.currentRoomId === roomId) {
      return;
    }
    this.#patch({
      currentRoomId: roomId,
      wsConnected: false,
      reconnectAttempt: 0,
      errorMessage: null,
    });
    this.#client.connect(roomId);
  }

  async createRoom(request: CreateRoomRequest): Promise<Room | null> {
    this.#patch({ isCreatingRoom: true, errorMessage: null });
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const text = await response.text();
        this.#patch({
          isCreatingRoom: false,
          errorMessage: `Create failed: ${text}`,
        });
        return null;
      }
      const payload = (await response.json()) as { room: Room };
      this.#patch({ isCreatingRoom: false });
      await this.loadRooms();
      this.selectRoom(payload.room.id);
      return payload.room;
    } catch {
      this.#patch({
        isCreatingRoom: false,
        errorMessage: "Network error while creating room.",
      });
      return null;
    }
  }

  async updateRoom(
    roomId: string,
    request: UpdateRoomRequest,
  ): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/rooms/${roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const text = await response.text();
        this.#patch({ errorMessage: `Update failed: ${text}` });
        return;
      }
      const payload = (await response.json()) as { room: Room };
      this.#mergeRoom(payload.room);
    } catch {
      this.#patch({ errorMessage: "Network error while updating room." });
    }
  }

  async pauseRoom(roomId: string): Promise<void> {
    await this.#postStatus(roomId, "pause");
  }

  async resumeRoom(roomId: string): Promise<void> {
    await this.#postStatus(roomId, "resume");
  }

  async deleteRoom(roomId: string): Promise<void> {
    try {
      await fetch(`${BACKEND_BASE_URL}/v1/rooms/${roomId}`, {
        method: "DELETE",
      });
      const remaining = this.#state.rooms.filter((r) => r.id !== roomId);
      const nextSelected = remaining[0]?.id ?? null;
      const views = { ...this.#state.views };
      delete views[roomId];
      this.#patch({
        rooms: remaining,
        currentRoomId: nextSelected,
        views,
      });
      if (nextSelected !== null) {
        this.#client.connect(nextSelected);
      } else {
        this.#client.disconnect();
      }
    } catch {
      this.#patch({ errorMessage: "Failed to delete room." });
    }
  }

  async #postStatus(roomId: string, action: "pause" | "resume"): Promise<void> {
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomId}/${action}`,
        { method: "POST" },
      );
      if (!response.ok) {
        this.#patch({ errorMessage: `${action} failed.` });
        return;
      }
    } catch {
      this.#patch({ errorMessage: `Network error during ${action}.` });
    }
  }

  // -- WebSocket event reduction ------------------------------------------

  #applyEvent(event: WsEvent): void {
    switch (event.type) {
      case "snapshot":
        this.#applySnapshot(event.room, event.events, event.reports);
        break;
      case "roomStatus":
        this.#patchCurrentRoom((room) => ({ ...room, status: event.status }));
        break;
      case "turnStarted":
        this.#mutateView((view) =>
          appendOrReplaceTurn(view, {
            turnId: event.turnId,
            agent: event.agent,
            kind: event.kind,
            content: "",
            reasoning: "",
            status: "streaming",
            sequence: null,
            timestamp: null,
            error: null,
          })
        );
        break;
      case "turnToken":
        this.#mutateView((view) =>
          mapTurn(view, event.turnId, (turn) => ({
            ...turn,
            content: turn.content + event.delta,
          }))
        );
        break;
      case "turnReasoningToken":
        this.#mutateView((view) =>
          mapTurn(view, event.turnId, (turn) => ({
            ...turn,
            reasoning: turn.reasoning + event.delta,
          }))
        );
        break;
      case "turnCompleted":
        this.#mutateView((view) =>
          mapTurn(view, event.turnId, (turn) => ({
            ...turn,
            content: event.content,
            status: "completed",
            sequence: event.sequence,
            timestamp: event.timestamp,
          }))
        );
        break;
      case "turnFailed":
        this.#mutateView((view) =>
          mapTurn(view, event.turnId, (turn) => ({
            ...turn,
            content: event.partial,
            status: "failed",
            error: event.error,
          }))
        );
        break;
      case "toolStarted":
        this.#mutateView((view) =>
          appendToolCall(view, {
            id: `live:${event.turnId}:${event.tool}:${view.toolCalls.length}`,
            turnId: event.turnId,
            sequence: null,
            tool: event.tool,
            argsPreview: event.argsPreview,
            status: "running",
            outputPreview: null,
            durationMs: null,
            timestamp: null,
          })
        );
        break;
      case "toolCompleted":
        this.#mutateView((view) => completeToolCall(view, event));
        break;
      case "reportStarted":
        this.#mutateView((view) =>
          appendReport(view, {
            reportId: event.reportId,
            sequence: event.sequence,
            content: "",
            status: "streaming",
            completedAt: null,
          })
        );
        break;
      case "reportToken":
        this.#mutateView((view) =>
          mapReport(view, event.reportId, (report) => ({
            ...report,
            content: report.content + event.delta,
          }))
        );
        break;
      case "reportCompleted":
        this.#mutateView((view) =>
          mapReport(view, event.reportId, (report) => ({
            ...report,
            content: event.content,
            status: event.status,
            completedAt: event.completedAt,
          }))
        );
        break;
    }
  }

  #applySnapshot(
    room: Room,
    events: RoomEvent[],
    reports: RoomReport[],
  ): void {
    const turns: TurnBuffer[] = [];
    const toolCalls: ToolCallEntry[] = [];
    for (const event of events) {
      ingestHistoryEvent(event, turns, toolCalls);
    }
    const view: RoomView = {
      room,
      turns,
      toolCalls,
      reports: reports.map(toReportBuffer),
    };
    this.#patch({
      views: { ...this.#state.views, [room.id]: view },
    });
    this.#mergeRoom(room);
  }

  #mergeRoom(updated: Room): void {
    const rooms = this.#state.rooms.some((r) => r.id === updated.id)
      ? this.#state.rooms.map((r) => (r.id === updated.id ? updated : r))
      : [updated, ...this.#state.rooms];
    const view = this.#state.views[updated.id];
    const views = view !== undefined
      ? { ...this.#state.views, [updated.id]: { ...view, room: updated } }
      : this.#state.views;
    this.#patch({ rooms, views });
  }

  #patchCurrentRoom(transform: (room: Room) => Room): void {
    const id = this.#state.currentRoomId;
    if (id === null) {
      return;
    }
    const room = this.#state.rooms.find((r) => r.id === id);
    if (room === undefined) {
      return;
    }
    this.#mergeRoom(transform(room));
  }

  #mutateView(transform: (view: RoomView) => RoomView): void {
    const id = this.#state.currentRoomId;
    if (id === null) {
      return;
    }
    const view = this.#state.views[id];
    if (view === undefined) {
      return;
    }
    const next = transform(view);
    this.#patch({ views: { ...this.#state.views, [id]: next } });
  }

  #patch(patch: Partial<DashboardState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

// -- Pure helpers ---------------------------------------------------------

function ingestHistoryEvent(
  event: RoomEvent,
  turns: TurnBuffer[],
  toolCalls: ToolCallEntry[],
): void {
  if (event.kind === "tool_call") {
    const record = parseToolCallRecord(event.content);
    if (record !== null) {
      toolCalls.push({
        id: `${event.sequence}`,
        turnId: "",
        sequence: event.sequence,
        tool: record.tool,
        argsPreview: previewArgs(record.args),
        status: record.ok ? "ok" : "error",
        outputPreview: record.outputPreview,
        durationMs: record.durationMs,
        timestamp: event.timestamp,
      });
    }
    return;
  }
  if (
    event.kind === "agent_chat" ||
    event.kind === "leader_note" ||
    event.kind === "system" ||
    event.kind === "phase"
  ) {
    turns.push(historyEventToTurn(event));
  }
}

function historyEventToTurn(event: RoomEvent): TurnBuffer {
  const kind: TurnBuffer["kind"] = event.kind === "leader_note"
    ? "leader_note"
    : "agent_chat";
  return {
    turnId: `history:${event.sequence}`,
    agent: event.agent ?? eventKindLabel(event.kind),
    kind,
    content: event.content,
    reasoning: "",
    status: "completed",
    sequence: event.sequence,
    timestamp: event.timestamp,
    error: null,
  };
}

function eventKindLabel(kind: RoomEventKind): string {
  switch (kind) {
    case "agent_chat":
      return "agent";
    case "leader_note":
      return "leader";
    case "phase":
      return "phase";
    case "system":
      return "system";
    case "tool_call":
      return "tool";
  }
}

function parseToolCallRecord(content: string): ToolCallRecord | null {
  try {
    const value = JSON.parse(content) as ToolCallRecord;
    return value;
  } catch {
    return null;
  }
}

function previewArgs(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) {
      return "";
    }
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  } catch {
    return "";
  }
}

function appendOrReplaceTurn(
  view: RoomView,
  turn: TurnBuffer,
): RoomView {
  const idx = view.turns.findIndex((t) => t.turnId === turn.turnId);
  const turns = idx >= 0
    ? view.turns.map((t, i) => (i === idx ? turn : t))
    : [...view.turns, turn];
  return { ...view, turns };
}

function mapTurn(
  view: RoomView,
  turnId: string,
  transform: (turn: TurnBuffer) => TurnBuffer,
): RoomView {
  const turns = view.turns.map((turn) =>
    turn.turnId === turnId ? transform(turn) : turn
  );
  return { ...view, turns };
}

function appendToolCall(view: RoomView, call: ToolCallEntry): RoomView {
  return { ...view, toolCalls: [...view.toolCalls, call] };
}

function completeToolCall(
  view: RoomView,
  event: {
    turnId: string;
    sequence: number;
    tool: string;
    ok: boolean;
    outputPreview: string;
    durationMs: number;
    timestamp: string;
  },
): RoomView {
  const idx = view.toolCalls.findIndex((c) =>
    c.status === "running" && c.turnId === event.turnId && c.tool === event.tool
  );
  if (idx < 0) {
    return appendToolCall(view, {
      id: `${event.sequence}`,
      turnId: event.turnId,
      sequence: event.sequence,
      tool: event.tool,
      argsPreview: "",
      status: event.ok ? "ok" : "error",
      outputPreview: event.outputPreview,
      durationMs: event.durationMs,
      timestamp: event.timestamp,
    });
  }
  const updated: ToolCallEntry = {
    ...view.toolCalls[idx],
    id: `${event.sequence}`,
    sequence: event.sequence,
    status: event.ok ? "ok" : "error",
    outputPreview: event.outputPreview,
    durationMs: event.durationMs,
    timestamp: event.timestamp,
  };
  const toolCalls = view.toolCalls.map((c, i) => (i === idx ? updated : c));
  return { ...view, toolCalls };
}

function appendReport(view: RoomView, report: ReportBuffer): RoomView {
  const idx = view.reports.findIndex((r) => r.reportId === report.reportId);
  const reports = idx >= 0
    ? view.reports.map((r, i) => (i === idx ? report : r))
    : [...view.reports, report];
  return { ...view, reports };
}

function mapReport(
  view: RoomView,
  reportId: string,
  transform: (report: ReportBuffer) => ReportBuffer,
): RoomView {
  const reports = view.reports.map((report) =>
    report.reportId === reportId ? transform(report) : report
  );
  return { ...view, reports };
}

function toReportBuffer(report: RoomReport): ReportBuffer {
  return {
    reportId: `${report.id}`,
    sequence: report.sequence,
    content: report.content,
    status: report.status,
    completedAt: report.completedAt,
  };
}

// Re-export for the dashboard view's status badge convenience.
export type { RoomStatus };
