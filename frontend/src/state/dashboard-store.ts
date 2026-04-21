import { BACKEND_BASE_URL } from "@/app/config";
import type {
  CreateRunResponse,
  DashboardState,
  RunEvent,
  RunKind,
} from "@/app/types";
import { RunClient } from "./run-client.ts";

type Listener = () => void;

const INITIAL_STATE: DashboardState = {
  activeRun: null,
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
    },
    onError: (message: string): void => {
      this.#setState({ errorMessage: message });
    },
  });

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  getState(): DashboardState {
    return this.#state;
  }

  async startRun(kind: RunKind): Promise<void> {
    this.#setState({ isStartingRun: true, errorMessage: null, events: [] });

    const endpoint = kind === "discussion" ? "discussion" : "weekly-report";

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/v1/runs/${endpoint}`, {
        method: "POST",
      });

      if (!response.ok) {
        this.#setState({
          isStartingRun: false,
          errorMessage: "Run request failed.",
        });
        return;
      }

      const payload = (await response.json()) as CreateRunResponse;
      this.#setState({
        activeRun: payload.run,
        isStartingRun: false,
        wsConnected: false,
      });
      this.#client.connect(payload.run.id);
    } catch {
      this.#setState({
        isStartingRun: false,
        errorMessage: "Network error while starting run.",
      });
    }
  }

  dispose(): void {
    this.#client.disconnect();
    this.#listeners.clear();
  }

  #setState(nextState: Partial<DashboardState>): void {
    this.#state = {
      ...this.#state,
      ...nextState,
    };

    for (const listener of this.#listeners) {
      listener();
    }
  }
}
