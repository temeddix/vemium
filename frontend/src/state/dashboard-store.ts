import { BACKEND_BASE_URL } from "@/app/config";
import type {
  AppSettings,
  CloneRoomRequest,
  CreateMessageRequest,
  CreateRoomRequest,
  Draft,
  DraftKind,
  Message,
  ProviderConfig,
  ProviderModelOption,
  ProviderModelsResponse,
  ReportBuffer,
  Room,
  RoomReport,
  RoomsListResponse,
  RoomView,
  SettingsEnvelope,
  UpdateAppSettingsRequest,
  UpdateRoomRequest,
  WorkspaceFile,
  WorkspaceFilesResponse,
  WsEvent,
} from "@/app/types";
import { RoomClient } from "./room-client.ts";

type Listener = () => void;

/**
 * Application-wide state shape exposed to web components. The store keeps
 * one `RoomView` per known room (keyed by `code`), the code of the
 * currently selected room, and connection status for the live WebSocket.
 */
export interface DashboardState {
  rooms: Room[];
  currentRoomCode: string | null;
  views: Record<string, RoomView>;
  settings: AppSettings | null;
  wsConnected: boolean;
  reconnectAttempt: number;
  errorMessage: string | null;
  isCreatingRoom: boolean;
  isSavingSettings: boolean;
}

const INITIAL_STATE: DashboardState = {
  rooms: [],
  currentRoomCode: null,
  views: {},
  settings: null,
  wsConnected: false,
  reconnectAttempt: 0,
  errorMessage: null,
  isCreatingRoom: false,
  isSavingSettings: false,
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
    void this.loadSettings();
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
    } catch {
      this.#patch({ errorMessage: "Network error while loading rooms." });
    }
  }

  async loadSettings(): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/settings`);
      if (!response.ok) {
        this.#patch({ errorMessage: "Failed to load settings." });
        return;
      }
      const payload = (await response.json()) as SettingsEnvelope;
      this.#patch({ settings: payload.settings });
    } catch {
      this.#patch({ errorMessage: "Network error while loading settings." });
    }
  }

  async saveSettings(
    request: UpdateAppSettingsRequest,
  ): Promise<boolean> {
    this.#patch({ isSavingSettings: true, errorMessage: null });
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const text = await response.text();
        this.#patch({
          isSavingSettings: false,
          errorMessage: `Save settings failed: ${text}`,
        });
        return false;
      }
      const payload = (await response.json()) as SettingsEnvelope;
      this.#patch({
        settings: payload.settings,
        isSavingSettings: false,
      });
      return true;
    } catch {
      this.#patch({
        isSavingSettings: false,
        errorMessage: "Network error while saving settings.",
      });
      return false;
    }
  }

  /**
   * Probes the provider configured by `config` and returns the model
   * identifiers it advertises. Used by the settings page to populate a
   * dropdown from the form's in-progress values; `tier` selects which
   * stored API key the redacted sentinel `***` falls back to on the
   * backend. Errors (network, upstream non-2xx, unparseable response)
   * resolve with an `error` string instead of throwing so the caller can
   * render a per-tier message without polluting global state.
   */
  async fetchProviderModels(
    tier: "low" | "high",
    config: ProviderConfig,
  ): Promise<{ models: ProviderModelOption[]; error: string | null }> {
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/providers/${tier}/models`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        },
      );
      if (!response.ok) {
        const text = await response.text();
        return {
          models: [],
          error: extractErrorMessage(text, response.status),
        };
      }
      const payload = (await response.json()) as ProviderModelsResponse;
      return { models: payload.models, error: null };
    } catch {
      return {
        models: [],
        error: "Network error while listing models.",
      };
    }
  }

  selectRoom(roomCode: string): void {
    if (this.#state.currentRoomCode === roomCode) {
      return;
    }
    this.#patch({
      currentRoomCode: roomCode,
      wsConnected: false,
      reconnectAttempt: 0,
      errorMessage: null,
    });
    this.#client.connect(roomCode);
  }

  /**
   * Drops the active WS subscription and clears the current selection.
   * Called by the router when navigating away from `/room/:code` so we
   * don't keep streaming events for an off-screen room.
   */
  clearSelection(): void {
    if (this.#state.currentRoomCode === null) {
      return;
    }
    this.#client.disconnect();
    this.#patch({
      currentRoomCode: null,
      wsConnected: false,
      reconnectAttempt: 0,
    });
  }

  /**
   * Returns the loaded room matching `code`, or null if none has loaded
   * yet. The router uses this to translate `/room/:code` URLs into a
   * `selectRoom(code)` call once the rooms list has populated.
   */
  findRoomByCode(code: string): Room | null {
    return this.#state.rooms.find((room) => room.code === code) ?? null;
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
      this.selectRoom(payload.room.code);
      return payload.room;
    } catch {
      this.#patch({
        isCreatingRoom: false,
        errorMessage: "Network error while creating room.",
      });
      return null;
    }
  }

  /**
   * Asks the backend to duplicate `roomCode` into a fresh room. The reply
   * carries the new room's metadata; we reload the room list so the clone
   * appears in the home grid before navigation. Returns the cloned room on
   * success, or null when the request fails.
   */
  async cloneRoom(
    roomCode: string,
    request: CloneRoomRequest,
  ): Promise<Room | null> {
    this.#patch({ errorMessage: null });
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/clone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      if (!response.ok) {
        const text = await response.text();
        this.#patch({ errorMessage: `Clone failed: ${text}` });
        return null;
      }
      const payload = (await response.json()) as { room: Room };
      await this.loadRooms();
      return payload.room;
    } catch {
      this.#patch({ errorMessage: "Network error while cloning room." });
      return null;
    }
  }

  async updateRoom(
    roomCode: string,
    request: UpdateRoomRequest,
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomCode}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
      );
      if (!response.ok) {
        const text = await response.text();
        this.#patch({ errorMessage: `Update failed: ${text}` });
        return false;
      }
      const payload = (await response.json()) as { room: Room };
      this.#mergeRoom(payload.room);
      return true;
    } catch {
      this.#patch({ errorMessage: "Network error while updating room." });
      return false;
    }
  }

  /**
   * POSTs a human-authored message into the room. The backend persists it
   * and broadcasts a `messageAdded` WS frame, so we don't need to mutate
   * local state here; the active subscription will deliver the event and
   * `#applyEvent` will append it to the view.
   */
  async sendUserMessage(
    roomCode: string,
    content: string,
  ): Promise<void> {
    const trimmed = content.trim();
    if (trimmed === "") {
      return;
    }
    const request: CreateMessageRequest = { content: trimmed };
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/messages`,
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

  /**
   * Fetches the flat list of files inside the given room's workspace. The
   * dialog turns this into a tree client-side. Hidden directories like
   * `.venv` are filtered server-side, so the response is safe to render
   * verbatim.
   */
  async loadWorkspaceFiles(roomCode: string): Promise<WorkspaceFile[] | null> {
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/files`,
      );
      if (!response.ok) {
        this.#patch({ errorMessage: "Failed to load workspace files." });
        return null;
      }
      const payload = (await response.json()) as WorkspaceFilesResponse;
      return payload.files;
    } catch {
      this.#patch({
        errorMessage: "Network error while loading workspace files.",
      });
      return null;
    }
  }

  /** URL the browser should `window.open` to view a single workspace file. */
  workspaceFileUrl(roomCode: string, path: string): string {
    const params = new URLSearchParams({ path });
    return `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/files/raw?${params.toString()}`;
  }

  /** URL of the workspace zip download for the given room. */
  workspaceDownloadUrl(roomCode: string): string {
    return `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/files/download`;
  }

  /**
   * Flips the user-controlled gate on this room to `Active`. Independent
   * of the leader-controlled `DebateState`: a room the leader paused stays
   * paused until the leader (or the resume schedule) flips it back;
   * activating only undoes a prior deactivation.
   */
  async activateRoom(roomCode: string): Promise<void> {
    await this.#postRoomStateAction(roomCode, "activate");
  }

  /**
   * Flips the user-controlled gate on this room to `Deactivated`. The
   * strongest off-switch - while deactivated the orchestrator is fully
   * halted regardless of what the leader does.
   */
  async deactivateRoom(roomCode: string): Promise<void> {
    await this.#postRoomStateAction(roomCode, "deactivate");
  }

  async deleteRoom(roomCode: string): Promise<void> {
    try {
      await fetch(`${BACKEND_BASE_URL}/v1/rooms/${roomCode}`, {
        method: "DELETE",
      });
      const remaining = this.#state.rooms.filter((r) => r.code !== roomCode);
      const nextSelected = remaining[0]?.code ?? null;
      const views = { ...this.#state.views };
      delete views[roomCode];
      this.#patch({
        rooms: remaining,
        currentRoomCode: nextSelected,
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

  async #postRoomStateAction(
    roomCode: string,
    action: "activate" | "deactivate",
  ): Promise<void> {
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/${action}`,
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
      case "roomState":
        this.#patchCurrentRoom((room) => ({ ...room, roomState: event.state }));
        break;
      case "debateState":
        this.#patchCurrentRoom((room) => ({
          ...room,
          debateState: event.state,
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
            runningTool: event.tool,
          }))
        );
        break;
      case "draftToolCompleted":
        this.#mutateView((view) =>
          mapDraft(
            view,
            event.turnId,
            (draft) =>
              draft.runningTool === event.tool
                ? { ...draft, runningTool: null }
                : draft,
          )
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
    };
    this.#patch({
      views: { ...this.#state.views, [room.code]: view },
    });
    this.#mergeRoom(room);
  }

  #mergeRoom(updated: Room): void {
    const rooms = this.#state.rooms.some((r) => r.code === updated.code)
      ? this.#state.rooms.map((r) => (r.code === updated.code ? updated : r))
      : [updated, ...this.#state.rooms];
    const view = this.#state.views[updated.code];
    const views = view !== undefined
      ? { ...this.#state.views, [updated.code]: { ...view, room: updated } }
      : this.#state.views;
    this.#patch({ rooms, views });
  }

  #patchCurrentRoom(transform: (room: Room) => Room): void {
    const code = this.#state.currentRoomCode;
    if (code === null) {
      return;
    }
    const room = this.#state.rooms.find((r) => r.code === code);
    if (room === undefined) {
      return;
    }
    this.#mergeRoom(transform(room));
  }

  #mutateView(transform: (view: RoomView) => RoomView): void {
    const code = this.#state.currentRoomCode;
    if (code === null) {
      return;
    }
    const view = this.#state.views[code];
    if (view === undefined) {
      return;
    }
    const next = transform(view);
    this.#patch({ views: { ...this.#state.views, [code]: next } });
  }

  #patch(patch: Partial<DashboardState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

// -- Pure helpers ---------------------------------------------------------

function emptyDraft(turnId: string, agent: string, kind: DraftKind): Draft {
  return {
    turnId,
    agent,
    kind,
    content: "",
    reasoning: "",
    runningTool: null,
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
  kind: DraftKind,
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
    // Default kind is `agent_chat` - placeholder for tokens that arrived
    // ahead of `DraftStarted`. The server's replay will rewrite the kind
    // before the next render if it's actually a leader-note draft.
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

/**
 * Extracts a human-readable message from a non-2xx response body. The
 * backend returns `{"error": "..."}` JSON for known failures; falls back to
 * the raw text if the body is not the expected shape, and to a generic
 * status-coded message when even that is empty.
 */
function extractErrorMessage(body: string, status: number): string {
  if (body !== "") {
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error !== "") {
        return parsed.error;
      }
    } catch {
      return body;
    }
  }
  return `Could not list models (HTTP ${status}).`;
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
