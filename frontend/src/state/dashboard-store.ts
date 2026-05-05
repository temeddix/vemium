import { BACKEND_BASE_URL } from "@/app/config";
import type {
  CreateMessageRequest,
  CreateRoomRequest,
  Draft,
  DraftToolCall,
  Message,
  ReportBuffer,
  Room,
  RoomReport,
  RoomsListResponse,
  RoomStatus,
  RoomView,
  TurnKind,
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

  /**
   * Drops the active WS subscription and clears the current selection.
   * Called by the router when navigating away from `/room/:slug` so we
   * don't keep streaming events for an off-screen room.
   */
  clearSelection(): void {
    if (this.#state.currentRoomId === null) {
      return;
    }
    this.#client.disconnect();
    this.#patch({
      currentRoomId: null,
      wsConnected: false,
      reconnectAttempt: 0,
    });
  }

  /**
   * Returns the loaded room matching `slug`, or null if none has loaded
   * yet. The router uses this to translate `/room/:slug` URLs into a
   * `selectRoom(id)` call once the rooms list has populated.
   */
  findRoomBySlug(slug: string): Room | null {
    return this.#state.rooms.find((room) => room.slug === slug) ?? null;
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

  /**
   * POSTs a human-authored message into the room. The backend persists it
   * and broadcasts a `messageAdded` WS frame, so we don't need to mutate
   * local state here; the active subscription will deliver the event and
   * `#applyEvent` will append it to the view.
   */
  async sendUserMessage(roomId: string, content: string): Promise<void> {
    const trimmed = content.trim();
    if (trimmed === "") {
      return;
    }
    const request: CreateMessageRequest = { content: trimmed };
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      if (!response.ok) {
        const text = await response.text();
        this.#patch({ errorMessage: `Send failed: ${text}` });
      }
    } catch {
      this.#patch({ errorMessage: "Network error while sending message." });
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
        this.#applySnapshot(event.room, event.messages, event.reports);
        break;
      case "roomStatus":
        this.#patchCurrentRoom((room) => ({ ...room, status: event.status }));
        break;
      case "inlineNote":
        this.#mutateView((view) => ({
          ...view,
          inlineNotes: [...view.inlineNotes, {
            author: event.author,
            text: event.text,
            reason: event.reason,
            timestamp: event.timestamp,
          }],
        }));
        break;
      case "draftStarted":
        this.#mutateView((view) =>
          upsertDraft(view, event.turnId, event.agent, event.kind)
        );
        break;
      case "draftText":
        this.#mutateView((view) =>
          mapDraft(view, event.turnId, (draft) => ({
            ...draft,
            content: draft.content + event.delta,
          }))
        );
        break;
      case "draftReasoning":
        this.#mutateView((view) =>
          mapDraft(view, event.turnId, (draft) => ({
            ...draft,
            reasoning: draft.reasoning + event.delta,
          }))
        );
        break;
      case "draftToolStarted":
        this.#mutateView((view) =>
          mapDraft(view, event.turnId, (draft) => ({
            ...draft,
            toolCalls: [...draft.toolCalls, {
              callId: event.callId,
              tool: event.tool,
              argsPreview: event.argsPreview,
              status: "running",
              outputPreview: null,
              durationMs: null,
            }],
          }))
        );
        break;
      case "draftToolCompleted":
        this.#mutateView((view) =>
          mapDraft(view, event.turnId, (draft) => ({
            ...draft,
            toolCalls: draft.toolCalls.map((call) =>
              call.callId === event.callId
                ? {
                  ...call,
                  status: event.ok ? "ok" : "error",
                  outputPreview: event.outputPreview,
                  durationMs: event.durationMs,
                }
                : call
            ),
          }))
        );
        break;
      case "draftFailed":
        this.#mutateView((view) =>
          mapDraft(view, event.turnId, (draft) => ({
            ...draft,
            status: "failed",
            error: event.error,
          }))
        );
        break;
      case "messageAdded":
        this.#mutateView((view) => ({
          ...view,
          messages: appendMessage(view.messages, event.message),
          drafts: view.drafts.filter((d) => d.turnId !== event.turnId),
        }));
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
    messages: Message[],
    reports: RoomReport[],
  ): void {
    // Snapshot is authoritative for `messages`. `drafts` are recreated by
    // any `DraftStarted` frames the server replays right after subscribe;
    // we wipe the live draft list so a stale draft from a previous
    // selection of the same room doesn't linger.
    const view: RoomView = {
      room,
      messages,
      drafts: [],
      reports: reports.map(toReportBuffer),
      inlineNotes: [],
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

function emptyDraft(turnId: string, agent: string, kind: TurnKind): Draft {
  return {
    turnId,
    agent,
    kind,
    content: "",
    reasoning: "",
    toolCalls: [],
    status: "streaming",
    error: null,
  };
}

/**
 * Inserts (or refreshes the metadata of) a draft for `turnId`. Refresh
 * happens when the server replays `DraftStarted` for an already-known
 * draft (e.g. because we're a late subscriber); we keep any tokens
 * already accumulated and just patch the header.
 */
function upsertDraft(
  view: RoomView,
  turnId: string,
  agent: string,
  kind: TurnKind,
): RoomView {
  const idx = view.drafts.findIndex((d) => d.turnId === turnId);
  if (idx < 0) {
    return {
      ...view,
      drafts: [...view.drafts, emptyDraft(turnId, agent, kind)],
    };
  }
  const drafts = view.drafts.map((d, i) =>
    i === idx ? { ...d, agent, kind } : d
  );
  return { ...view, drafts };
}

/**
 * Applies `transform` to the draft for `turnId`. If no such draft exists
 * yet (we received a delta before any `DraftStarted` frame), creates an
 * anonymous placeholder so the tokens have somewhere to land - the
 * server's replay will fill in the header before the next render.
 */
function mapDraft(
  view: RoomView,
  turnId: string,
  transform: (draft: Draft) => Draft,
): RoomView {
  const idx = view.drafts.findIndex((d) => d.turnId === turnId);
  if (idx < 0) {
    const placeholder = emptyDraft(turnId, "", "agent_chat");
    return {
      ...view,
      drafts: [...view.drafts, transform(placeholder)],
    };
  }
  const drafts = view.drafts.map((d, i) => (i === idx ? transform(d) : d));
  return { ...view, drafts };
}

/**
 * Inserts `message` into `messages` keeping the list sorted by sequence.
 * `MessageAdded` frames usually arrive in order, but we tolerate
 * reordering (e.g. on-demand leader notes interleaved with a debater
 * turn) by re-sorting around the insertion point.
 */
function appendMessage(messages: Message[], incoming: Message): Message[] {
  if (messages.some((m) => m.sequence === incoming.sequence)) {
    return messages.map((m) => m.sequence === incoming.sequence ? incoming : m);
  }
  if (
    messages.length === 0 ||
    incoming.sequence > messages[messages.length - 1].sequence
  ) {
    return [...messages, incoming];
  }
  const next = [...messages, incoming];
  next.sort((a, b) => a.sequence - b.sequence);
  return next;
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

// `DraftToolCall` is referenced indirectly through `Draft.toolCalls`. Re-
// export the alias so consumers (room-detail.ts) can keep their imports
// minimal even though we never construct one directly here.
export type { DraftToolCall };

// Re-export for the dashboard view's status badge convenience.
export type { RoomStatus };
