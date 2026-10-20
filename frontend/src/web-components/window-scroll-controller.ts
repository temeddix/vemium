import type { ReactiveController, ReactiveControllerHost } from "lit";

/** Listens to the window's passive `scroll` events while the host is connected. */
export class WindowScrollController implements ReactiveController {
  #onScroll: () => void = (): void => {
    // Nothing listens until `listen` is called.
  };

  constructor(host: ReactiveControllerHost) {
    host.addController(this);
  }

  /** Sets what runs on each scroll. */
  listen(onScroll: () => void): this {
    this.#onScroll = onScroll;
    return this;
  }

  hostConnected(): void {
    globalThis.addEventListener("scroll", this.#onScroll, { passive: true });
  }

  hostDisconnected(): void {
    globalThis.removeEventListener("scroll", this.#onScroll);
  }
}
