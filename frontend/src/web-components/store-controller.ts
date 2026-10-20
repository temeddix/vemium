import type { ReactiveController, ReactiveControllerHost } from "lit";

import { type DashboardState, DashboardStore } from "#state";

/** Hands the host the store it currently holds, if any. */
type StoreGetter = () => DashboardStore | null;

/** Receives every state the store publishes. */
type StateListener = (state: DashboardState) => void;

/**
 * Keeps a host subscribed to the dashboard store it was handed through
 * context. The subscription opens when the host connects, moves over when
 * the host is handed a different store, and closes when the host leaves the
 * document. The host turns each published state into its own reactive state.
 */
export class StoreController implements ReactiveController {
  #getStore: StoreGetter = (): DashboardStore | null => null;
  #onState: StateListener = (): void => {
    // Nothing listens until `track` is called.
  };
  #store: DashboardStore | null = null;
  #unsubscribe: (() => void) | null = null;

  constructor(host: ReactiveControllerHost) {
    host.addController(this);
  }

  /** Sets where the store comes from and who hears its states. */
  track(getStore: StoreGetter, onState: StateListener): this {
    this.#getStore = getStore;
    this.#onState = onState;
    return this;
  }

  hostConnected(): void {
    this.#bind();
  }

  hostUpdated(): void {
    if (this.#getStore() !== this.#store) {
      this.#unbind();
      this.#bind();
    }
  }

  hostDisconnected(): void {
    this.#unbind();
  }

  #bind(): void {
    const store = this.#getStore();
    // Before context arrives the host's store is still unset.
    if (this.#unsubscribe !== null || !(store instanceof DashboardStore)) {
      return;
    }
    this.#store = store;
    this.#unsubscribe = store.subscribe((): void => {
      this.#onState(store.getState());
    });
    this.#onState(store.getState());
  }

  #unbind(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#store = null;
  }
}
