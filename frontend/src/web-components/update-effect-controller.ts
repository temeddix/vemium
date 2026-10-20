import type { ReactiveController, ReactiveControllerHost } from "lit";

/** The host's own work, run at one point of its lifecycle. */
type Effect = () => void;

/** Does nothing, for the lifecycle points a host has no work for. */
function skip(): void {
  // Nothing to run.
}

/**
 * Runs the host's own work when it connects, after each of its updates, and
 * when it leaves the document. The callbacks belong to the host and touch
 * only its own state.
 */
export class UpdateEffectController implements ReactiveController {
  #connected: Effect = skip;
  #updated: Effect = skip;
  #disconnected: Effect = skip;

  constructor(host: ReactiveControllerHost) {
    host.addController(this);
  }

  /** Sets what runs when the host connects. */
  onConnected(effect: Effect): this {
    this.#connected = effect;
    return this;
  }

  /** Sets what runs after each host update. */
  onUpdated(effect: Effect): this {
    this.#updated = effect;
    return this;
  }

  /** Sets what runs when the host leaves the document. */
  onDisconnected(effect: Effect): this {
    this.#disconnected = effect;
    return this;
  }

  hostConnected(): void {
    this.#connected();
  }

  hostUpdated(): void {
    this.#updated();
  }

  hostDisconnected(): void {
    this.#disconnected();
  }
}
