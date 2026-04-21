import { BACKEND_BASE_URL } from "@/app/config";
import type {
  ActiveRunResponse,
  CreateRunResponse,
  DashboardState,
  RunEvent,
  RunSettings,
  RunSettingsResponse,
  RunsResponse,
  SaveRunSettingsRequest,
  SaveRunSettingsResponse,
  StartRunRequest,
} from "@/app/types";
import { RunClient } from "./run-client.ts";

type Listener = () => void;

const INITIAL_STATE: DashboardState = {
  activeRun: null,
  runs: [],
  events: [],
  wsConnected: false,
  reconnectAttempt: 0,
  isStartingRun: false,
  errorMessage: null,
};

export class DashboardStore {
  #state: DashboardState = INITIAL_STATE;
  #listeners = new Set<Listener>();
  #client = new RunClient({
    onConnected: (): void => {
      this.#setState({ wsConnected: true, reconnectAttempt: 0 });
    },
    onDisconnected: (attempt: number): void => {
      this.#setState({ wsConnected: false, reconnectAttempt: attempt });
    },
    onEvent: (event: RunEvent): void => {
      this.#setState({ events: [...this.#state.events, event] });
      if (event.eventType === "run_completed") {
        void this.loadRuns();
      }
    },
    onError: (message: string): void => {
      this.#setState({ errorMessage: message });
    },
  });

  constructor() {
    void this.loadRuns();
    void this.#resumeActiveRun();
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

  async startRun(request?: StartRunRequest): Promise<void> {
    this.#setState({ isStartingRun: true, errorMessage: null, events: [] });

    try {
      const requestPayload = this.#buildRequestPayload(request);
      const response = await fetch(`${BACKEND_BASE_URL}/v1/runs/discussion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        this.#setState({ isStartingRun: false, errorMessage: "Run request failed." });
        return;
      }

      const responsePayload = (await response.json()) as CreateRunResponse;
      this.#setState({
        activeRun: responsePayload.run,
        isStartingRun: false,
        wsConnected: false,
      });
      this.#client.connect(responsePayload.run.id);
      void this.loadRuns();
    } catch {
      this.#setState({ isStartingRun: false, errorMessage: "Network error while starting run." });
    }
  }

  async loadRuns(): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/runs`);
      if (!response.ok) return;
      const payload = (await response.json()) as RunsResponse;
      this.#setState({ runs: payload.runs });
    } catch {
      this.#setState({ errorMessage: "Failed to load run history." });
    }
  }

  async loadSettings(): Promise<RunSettings[]> {
    const response = await fetch(`${BACKEND_BASE_URL}/v1/settings`);
    if (!response.ok) throw new Error("Failed to load settings");
    const payload = (await response.json()) as RunSettingsResponse;
    return payload.settings;
  }

  async saveSettings(request: SaveRunSettingsRequest): Promise<RunSettings> {
    const response = await fetch(
      `${BACKEND_BASE_URL}/v1/settings/discussion`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) throw new Error("Failed to save settings");
    const payload = (await response.json()) as SaveRunSettingsResponse;
    return payload.setting;
  }

  selectRun(runId: string): void {
    const selectedRun = this.#state.runs.find((run) => run.id === runId);
    if (selectedRun === undefined) {
      this.#setState({ errorMessage: "Selected run was not found." });
      return;
    }

    this.#setState({
      activeRun: selectedRun,
      events: [],
      wsConnected: false,
      reconnectAttempt: 0,
      errorMessage: null,
    });
    this.#client.connect(selectedRun.id);
  }

  dispose(): void {
    this.#client.disconnect();
    this.#listeners.clear();
  }

  async #resumeActiveRun(): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/runs/active`);
      if (!response.ok) return;

      const payload = (await response.json()) as ActiveRunResponse;
      if (payload.run === null) return;

      this.#setState({ activeRun: payload.run, events: [], wsConnected: false });
      this.#client.connect(payload.run.id);
      void this.loadRuns();
    } catch {
      this.#setState({ errorMessage: "Could not restore active run session." });
    }
  }

  #buildRequestPayload(request?: StartRunRequest): StartRunRequest {
    if (request === undefined) return {};

    const next: StartRunRequest = {};

    if (request.topic?.trim()) next.topic = request.topic.trim();
    if (request.goal?.trim()) next.goal = request.goal.trim();
    if (request.instruction?.trim()) next.instruction = request.instruction.trim();
    if (request.background?.trim()) next.background = request.background.trim();
    if (request.intervalSeconds !== undefined && Number.isFinite(request.intervalSeconds)) {
      next.intervalSeconds = Math.max(0, Math.floor(request.intervalSeconds));
    }
    if (request.rounds !== undefined && Number.isFinite(request.rounds)) {
      next.rounds = Math.max(1, Math.floor(request.rounds));
    }
    if (request.runForever !== undefined) next.runForever = request.runForever;

    return next;
  }

  #setState(nextState: Partial<DashboardState>): void {
    this.#state = { ...this.#state, ...nextState };
    for (const listener of this.#listeners) listener();
  }
}
