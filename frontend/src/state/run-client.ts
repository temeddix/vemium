import { BACKEND_BASE_URL, RECONNECT_DELAYS_MS } from "@/app/config";
import type { RunEvent } from "@/app/types";
import { sleep } from "@/app/utils";

export interface RunClientCallbacks {
  onConnected: () => void;
  onDisconnected: (attempt: number) => void;
  onEvent: (event: RunEvent) => void;
  onError: (message: string) => void;
}

export class RunClient {
  #callbacks: RunClientCallbacks;
  #runId: string | null = null;
  #socket: WebSocket | null = null;
  #disposed = false;

  constructor(callbacks: RunClientCallbacks) {
    this.#callbacks = callbacks;
  }

  connect(runId: string): void {
    this.disconnect();
    this.#runId = runId;
    this.#disposed = false;
    void this.#connectLoop();
  }

  disconnect(): void {
    this.#disposed = true;
    if (this.#socket !== null) {
      this.#socket.close();
      this.#socket = null;
    }
  }

  async #connectLoop(): Promise<void> {
    if (this.#runId === null) {
      return;
    }

    let reconnectAttempt = 0;

    while (!this.#disposed) {
      const streamUrl = `${
        BACKEND_BASE_URL.replace("http", "ws")
      }/v1/runs/${this.#runId}/stream`;
      const socket = new WebSocket(streamUrl);
      this.#socket = socket;

      const connected = await this.#waitForSocketOpen(socket);
      if (!connected) {
        reconnectAttempt += 1;
        this.#callbacks.onDisconnected(reconnectAttempt);
        await this.#waitForReconnect(reconnectAttempt);
        continue;
      }

      reconnectAttempt = 0;
      this.#callbacks.onConnected();

      const closeEvent = await this.#consumeSocketMessages(socket);
      if (this.#disposed) {
        return;
      }

      if (closeEvent !== null && closeEvent.code === 1000) {
        return;
      }

      reconnectAttempt += 1;
      this.#callbacks.onDisconnected(reconnectAttempt);
      await this.#waitForReconnect(reconnectAttempt);
    }
  }

  #waitForSocketOpen(socket: WebSocket): Promise<boolean> {
    return new Promise((resolve): void => {
      socket.onopen = (): void => {
        resolve(true);
      };
      socket.onerror = (): void => {
        resolve(false);
      };
      socket.onclose = (): void => {
        resolve(false);
      };
    });
  }

  #consumeSocketMessages(socket: WebSocket): Promise<CloseEvent | null> {
    return new Promise((resolve): void => {
      socket.onmessage = (event: MessageEvent<string>): void => {
        try {
          const parsed = JSON.parse(event.data) as RunEvent;
          this.#callbacks.onEvent(parsed);
        } catch {
          this.#callbacks.onError("Failed to parse event payload.");
        }
      };

      socket.onerror = (): void => {
        this.#callbacks.onError("WebSocket connection error.");
      };

      socket.onclose = (closeEvent: CloseEvent): void => {
        resolve(closeEvent);
      };
    });
  }

  async #waitForReconnect(reconnectAttempt: number): Promise<void> {
    const index = Math.min(
      reconnectAttempt - 1,
      RECONNECT_DELAYS_MS.length - 1,
    );
    const delayMs = RECONNECT_DELAYS_MS[index] ?? 8000;
    await sleep(delayMs);
  }
}
