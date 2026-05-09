import { BACKEND_BASE_URL } from "@/app/config";
import type {
  AppSettings,
  CloneRoomRequest,
  CreateMessageRequest,
  CreateRoomRequest,
  ProviderConfig,
  ProviderModelOption,
  ProviderModelsResponse,
  ReportBuffer,
  Room,
  RoomEvent,
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
 * Single source of truth for the UI. Web components subscribe via
 * `subscribe()` and read with `getState()`. The store owns one
 * `RoomClient` and re-targets it whenever the user selects a different
 * room.
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
        this.#patch({ errorMessage: `Duplicate failed: ${text}` });
        return null;
      }
      const payload = (await response.json()) as { room: Room };
      await this.loadRooms();
      return payload.room;
    } catch {
      this.#patch({ errorMessage: "Network error while duplicating room." });
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

  workspaceFileUrl(roomCode: string, path: string): string {
    const params = new URLSearchParams({ path });
    return `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/files/raw?${params.toString()}`;
  }

  workspaceDownloadUrl(roomCode: string): string {
    return `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/files/download`;
  }

  async activateRoom(roomCode: string): Promise<void> {
    await this.#postRoomStateAction(roomCode, "activate");
  }

  async deactivateRoom(roomCode: string): Promise<void> {
    await this.#postRoomStateAction(roomCode, "deactivate");
  }

  async resumeRoom(roomCode: string): Promise<void> {
    await this.#postRoomStateAction(roomCode, "resume");
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
    action: "activate" | "deactivate" | "resume",
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
        this.#applySnapshot(event.room, event.events, event.reports);
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
      case "rowAdded":
        this.#mutateView((view) => upsertRow(view, event.event));
        break;
      case "rowDelta":
        this.#mutateView((view) =>
          mapRow(view, event.id, (row) => ({
            ...row,
            content: row.content + (event.contentDelta ?? ""),
            detail: row.detail + (event.detailDelta ?? ""),
          }))
        );
        break;
      case "rowFinished":
        this.#mutateView((view) =>
          mapRow(view, event.id, (row) => ({
            ...row,
            content: event.content,
            detail: event.detail,
            success: event.success,
            completedAt: event.completedAt,
          }))
        );
        break;
      case "reportStarted":
        this.#mutateView((view) =>
          appendReport(view, {
            reportId: event.reportId,
            sequence: event.sequence,
            content: "",
            success: false,
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
            success: event.success,
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
    const view: RoomView = {
      room,
      events: events.slice().sort((a, b) => a.sequence - b.sequence),
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

/**
 * Inserts (or replaces) `incoming` in `view.events`, keeping the list
 * sorted by `sequence`. If a row with the same id already exists (e.g.
 * a `rowAdded` arriving after a snapshot replayed it), the latest wire
 * payload wins.
 */
function upsertRow(view: RoomView, incoming: RoomEvent): RoomView {
  if (incoming.id === null) {
    return { ...view, events: [...view.events, incoming] };
  }
  const existing = view.events.findIndex((e) => e.id === incoming.id);
  if (existing >= 0) {
    const events = view.events.map((e, i) => (i === existing ? incoming : e));
    return { ...view, events };
  }
  if (
    view.events.length === 0 ||
    incoming.sequence > view.events[view.events.length - 1].sequence
  ) {
    return { ...view, events: [...view.events, incoming] };
  }
  const events = [...view.events, incoming].sort(
    (a, b) => a.sequence - b.sequence,
  );
  return { ...view, events };
}

function mapRow(
  view: RoomView,
  id: number,
  transform: (row: RoomEvent) => RoomEvent,
): RoomView {
  const events = view.events.map((
    row,
  ) => (row.id === id ? transform(row) : row));
  return { ...view, events };
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
    success: report.success,
    completedAt: report.completedAt,
  };
}
