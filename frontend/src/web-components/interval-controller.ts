import type { ReactiveController, ReactiveControllerHost } from "lit";

/**
 * Runs a callback on a fixed interval while the host is in the document:
 * once right away when it connects, then on every interval, and never
 * again once it leaves.
 */
export class IntervalController implements ReactiveController {
  #intervalMs: number = 0;
  #onTick: () => void = (): void => {
    // Nothing ticks until `schedule` is called.
  };
  #timer: number | null = null;

  constructor(host: ReactiveControllerHost) {
    host.addController(this);
  }

  /** Sets the interval and what runs on each tick. */
  schedule(intervalMs: number, onTick: () => void): this {
    this.#intervalMs = intervalMs;
    this.#onTick = onTick;
    return this;
  }

  hostConnected(): void {
    this.#onTick();
    this.#timer = setInterval(this.#onTick, this.#intervalMs);
  }

  hostDisconnected(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }
}
