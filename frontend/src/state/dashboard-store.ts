import { BACKEND_BASE_URL } from "#config";
import {
  type AppSettings,
  type CreateMessageRequest,
  type CreateRoomRequest,
  isErrorBody,
  isProviderModelsResponse,
  isRoomEnvelope,
  isRoomsListResponse,
  isRoomStateResponse,
  isSettingsEnvelope,
  isWorkspaceFilesResponse,
  type ProviderConfig,
  type ProviderModelOption,
  type ReportBuffer,
  type Room,
  type RoomEvent,
  type RoomReport,
  type RoomView,
  type UpdateAppSettingsRequest,
  type UpdateRoomRequest,
  type WorkspaceFile,
  type WsEvent,
} from "#types";

import { RoomClient } from "./room-client.ts";

type Listener = () => void;

/** A provider tier: which of the two stored configurations to use. */
export type Tier = "LOW" | "HIGH";

/** Which way a room's on/off switch is being flipped. */
type RoomStateAction = "ACTIVATE" | "DEACTIVATE";

/** The models a provider lists, or why it could not list them. */
export interface ProviderModelsResult {
  models: ProviderModelOption[];
  error: string | null;
}

/** Orders timeline rows by `sequence`. */
function bySequence(left: RoomEvent, right: RoomEvent): number {
  return left.sequence - right.sequence;
}

/**
 * Reads a response's JSON and checks it is the shape the endpoint documents.
 * One that is not fails like a network error.
 */
async function readJson<T>(
  response: Response,
  isShape: (value: unknown) => value is T,
): Promise<T> {
  const payload: unknown = await response.json();
  if (!isShape(payload)) {
    throw new Error("The server answered an unexpected shape");
  }
  return payload;
}

/**
 * Application-wide state shape exposed to web components. The store keeps
 * one `RoomView` per known room (keyed by `code`), the code of the
 * currently selected room, and connection status for the live WebSocket.
 */
export interface DashboardState {
  rooms: Room[];
  currentRoomCode: string | null;
  views: Map<string, RoomView>;
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
  views: new Map<string, RoomView>(),
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
        this.#setState({
          ...this.#state,
          wsConnected: true,
          reconnectAttempt: 0,
        });
      },
      onDisconnected: (attempt: number): void => {
        this.#setState({
          ...this.#state,
          wsConnected: false,
          reconnectAttempt: attempt,
        });
      },
      onEvent: (event: WsEvent): void => {
        this.#applyEvent(event);
      },
      onError: (message: string): void => {
        this.#setState({ ...this.#state, errorMessage: message });
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
        this.#setState({
          ...this.#state,
          errorMessage: "Failed to load rooms.",
        });
        return;
      }
      const payload = await readJson(response, isRoomsListResponse);
      this.#setState({ ...this.#state, rooms: payload.rooms });
    } catch {
      this.#setState({
        ...this.#state,
        errorMessage: "Network error while loading rooms.",
      });
    }
  }

  async loadSettings(): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/settings`);
      if (!response.ok) {
        this.#setState({
          ...this.#state,
          errorMessage: "Failed to load settings.",
        });
        return;
      }
      const payload = await readJson(response, isSettingsEnvelope);
      this.#setState({ ...this.#state, settings: payload.settings });
    } catch {
      this.#setState({
        ...this.#state,
        errorMessage: "Network error while loading settings.",
      });
    }
  }

  async saveSettings(request: UpdateAppSettingsRequest): Promise<boolean> {
    this.#setState({
      ...this.#state,
      isSavingSettings: true,
      errorMessage: null,
    });
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const text = await response.text();
        this.#setState({
          ...this.#state,
          isSavingSettings: false,
          errorMessage: `Save settings failed: ${text}`,
        });
        return false;
      }
      const payload = await readJson(response, isSettingsEnvelope);
      this.#setState({
        ...this.#state,
        settings: payload.settings,
        isSavingSettings: false,
      });
      return true;
    } catch {
      this.#setState({
        ...this.#state,
        isSavingSettings: false,
        errorMessage: "Network error while saving settings.",
      });
      return false;
    }
  }

  async fetchProviderModels(
    tier: Tier,
    config: ProviderConfig,
  ): Promise<ProviderModelsResult> {
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
      const payload = await readJson(response, isProviderModelsResponse);
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
    this.#setState({
      ...this.#state,
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
    this.#setState({
      ...this.#state,
      currentRoomCode: null,
      wsConnected: false,
      reconnectAttempt: 0,
    });
  }

  findRoomByCode(code: string): Room | null {
    return this.#state.rooms.find((room) => room.code === code) ?? null;
  }

  async createRoom(request: CreateRoomRequest): Promise<Room | null> {
    this.#setState({
      ...this.#state,
      isCreatingRoom: true,
      errorMessage: null,
    });
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const text = await response.text();
        this.#setState({
          ...this.#state,
          isCreatingRoom: false,
          errorMessage: `Create failed: ${text}`,
        });
        return null;
      }
      const payload = await readJson(response, isRoomEnvelope);
      this.#setState({ ...this.#state, isCreatingRoom: false });
      await this.loadRooms();
      this.selectRoom(payload.room.code);
      return payload.room;
    } catch {
      this.#setState({
        ...this.#state,
        isCreatingRoom: false,
        errorMessage: "Network error while creating room.",
      });
      return null;
    }
  }

  async cloneRoom(roomCode: string): Promise<Room | null> {
    this.#setState({ ...this.#state, errorMessage: null });
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/clone`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      if (!response.ok) {
        const text = await response.text();
        this.#setState({
          ...this.#state,
          errorMessage: `Duplicate failed: ${text}`,
        });
        return null;
      }
      const payload = await readJson(response, isRoomEnvelope);
      await this.loadRooms();
      return payload.room;
    } catch {
      this.#setState({
        ...this.#state,
        errorMessage: "Network error while duplicating room.",
      });
      return null;
    }
  }

  async updateRoom(
    roomCode: string,
    request: UpdateRoomRequest,
  ): Promise<boolean> {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/rooms/${roomCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const text = await response.text();
        this.#setState({
          ...this.#state,
          errorMessage: `Update failed: ${text}`,
        });
        return false;
      }
      const payload = await readJson(response, isRoomEnvelope);
      this.#mergeRoom(payload.room);
      return true;
    } catch {
      this.#setState({
        ...this.#state,
        errorMessage: "Network error while updating room.",
      });
      return false;
    }
  }

  async sendUserMessage(roomCode: string, content: string): Promise<void> {
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
        this.#setState({
          ...this.#state,
          errorMessage: `Send failed: ${text}`,
        });
      }
    } catch {
      this.#setState({
        ...this.#state,
        errorMessage: "Network error while sending message.",
      });
    }
  }

  async loadWorkspaceFiles(roomCode: string): Promise<WorkspaceFile[] | null> {
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/files`,
      );
      if (!response.ok) {
        this.#setState({
          ...this.#state,
          errorMessage: "Failed to load workspace files.",
        });
        return null;
      }
      const payload = await readJson(response, isWorkspaceFilesResponse);
      return payload.files;
    } catch {
      this.#setState({
        ...this.#state,
        errorMessage: "Network error while loading workspace files.",
      });
      return null;
    }
  }

  workspaceFileUrl(roomCode: string, path: string): string {
    const encoded = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${BACKEND_BASE_URL}/${roomCode}/files/${encoded}`;
  }

  workspaceDownloadUrl(roomCode: string): string {
    return `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/files/download`;
  }

  async toggleRoomActivation(room: Room): Promise<void> {
    const action: RoomStateAction =
      room.roomState === "DEACTIVATED" ? "ACTIVATE" : "DEACTIVATE";
    await this.#postRoomStateAction(room.code, action);
  }

  async deleteRoom(roomCode: string): Promise<void> {
    try {
      await fetch(`${BACKEND_BASE_URL}/v1/rooms/${roomCode}`, {
        method: "DELETE",
      });
      const remaining = this.#state.rooms.filter(
        (candidate) => candidate.code !== roomCode,
      );
      const nextSelected = remaining[0]?.code ?? null;
      const views = new Map(this.#state.views);
      views.delete(roomCode);
      this.#setState({
        ...this.#state,
        rooms: remaining,
        currentRoomCode: nextSelected,
        views,
      });
      if (nextSelected === null) {
        this.#client.disconnect();
      } else {
        this.#client.connect(nextSelected);
      }
    } catch {
      this.#setState({
        ...this.#state,
        errorMessage: "Failed to delete room.",
      });
    }
  }

  async #postRoomStateAction(
    roomCode: string,
    action: RoomStateAction,
  ): Promise<void> {
    const verb = action === "ACTIVATE" ? "activate" : "deactivate";
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/${verb}`,
        { method: "POST" },
      );
      if (!response.ok) {
        this.#setState({ ...this.#state, errorMessage: `${verb} failed.` });
        return;
      }
      const payload = await readJson(response, isRoomStateResponse);
      const room = this.#state.rooms.find(
        (candidate) => candidate.code === roomCode,
      );
      if (room !== undefined) {
        this.#mergeRoom({ ...room, roomState: payload.roomState });
      }
    } catch {
      this.#setState({
        ...this.#state,
        errorMessage: `Network error during ${verb}.`,
      });
    }
  }

  // -- WebSocket event reduction ------------------------------------------

  #applyEvent(event: WsEvent): void {
    switch (event.type) {
      case "SNAPSHOT":
        this.#applySnapshot(event.room, event.events, event.reports);
        break;
      case "ROOM_STATE":
        this.#patchCurrentRoom((room) => ({ ...room, roomState: event.state }));
        break;
      case "DEBATE_STATE":
        this.#patchCurrentRoom((room) => ({
          ...room,
          debateState: event.state,
        }));
        break;
      case "ROW_ADDED":
        this.#mutateView((view) => upsertRow(view, event.event));
        break;
      case "ROW_DELTA":
        this.#mutateView((view) =>
          mapRow(view, event.id, (row) => ({
            ...row,
            content: row.content + (event.contentDelta ?? ""),
            detail: row.detail + (event.detailDelta ?? ""),
          })),
        );
        break;
      case "ROW_FINISHED":
        this.#mutateView((view) =>
          mapRow(view, event.id, (row) => ({
            ...row,
            content: event.content,
            detail: event.detail,
            success: event.success,
            completedAt: event.completedAt,
          })),
        );
        break;
      case "REPORT_STARTED":
        this.#mutateView((view) =>
          appendReport(view, {
            reportId: event.reportId,
            sequence: event.sequence,
            content: "",
            success: false,
            completedAt: null,
          }),
        );
        break;
      case "REPORT_TOKEN":
        this.#mutateView((view) =>
          mapReport(view, event.reportId, (report) => ({
            ...report,
            content: report.content + event.delta,
          })),
        );
        break;
      case "REPORT_COMPLETED":
        this.#mutateView((view) =>
          mapReport(view, event.reportId, (report) => ({
            ...report,
            content: event.content,
            success: event.success,
            completedAt: event.completedAt,
          })),
        );
        break;
    }
  }

  #applySnapshot(room: Room, events: RoomEvent[], reports: RoomReport[]): void {
    const view: RoomView = {
      room,
      events: events.toSorted(bySequence),
      reports: reports.map((report) => toReportBuffer(report)),
    };
    const views = new Map([...this.#state.views, [room.code, view]]);
    this.#setState({ ...this.#state, views });
    this.#mergeRoom(room);
  }

  #mergeRoom(updated: Room): void {
    const rooms = this.#state.rooms.some((room) => room.code === updated.code)
      ? this.#state.rooms.map((room) =>
          room.code === updated.code ? updated : room,
        )
      : [updated, ...this.#state.rooms];
    const view = this.#state.views.get(updated.code);
    const views =
      view === undefined
        ? this.#state.views
        : new Map([
            ...this.#state.views,
            [updated.code, { ...view, room: updated }],
          ]);
    this.#setState({ ...this.#state, rooms, views });
  }

  #patchCurrentRoom(transform: (room: Room) => Room): void {
    const code = this.#state.currentRoomCode;
    if (code === null) {
      return;
    }
    const room = this.#state.rooms.find((candidate) => candidate.code === code);
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
    const view = this.#state.views.get(code);
    if (view === undefined) {
      return;
    }
    const views = new Map([...this.#state.views, [code, transform(view)]]);
    this.#setState({ ...this.#state, views });
  }

  #setState(next: DashboardState): void {
    this.#state = next;
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
  const existing = view.events.findIndex((row) => row.id === incoming.id);
  if (existing !== -1) {
    const events = view.events.map((row, index) =>
      index === existing ? incoming : row,
    );
    return { ...view, events };
  }
  const last = view.events.at(-1);
  if (last === undefined || incoming.sequence > last.sequence) {
    return { ...view, events: [...view.events, incoming] };
  }
  const events = [...view.events, incoming].toSorted(bySequence);
  return { ...view, events };
}

function mapRow(
  view: RoomView,
  id: number,
  transform: (row: RoomEvent) => RoomEvent,
): RoomView {
  const events = view.events.map((row) =>
    row.id === id ? transform(row) : row,
  );
  return { ...view, events };
}

function appendReport(view: RoomView, report: ReportBuffer): RoomView {
  const existing = view.reports.findIndex(
    (candidate) => candidate.reportId === report.reportId,
  );
  const reports =
    existing === -1
      ? [...view.reports, report]
      : view.reports.map((candidate, index) =>
          index === existing ? report : candidate,
        );
  return { ...view, reports };
}

function mapReport(
  view: RoomView,
  reportId: string,
  transform: (report: ReportBuffer) => ReportBuffer,
): RoomView {
  const reports = view.reports.map((report) =>
    report.reportId === reportId ? transform(report) : report,
  );
  return { ...view, reports };
}

function extractErrorMessage(body: string, status: number): string {
  if (body !== "") {
    try {
      const parsed: unknown = JSON.parse(body);
      if (isErrorBody(parsed) && parsed.error !== "") {
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
