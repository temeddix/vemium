import { BACKEND_BASE_URL, RECONNECT_DELAYS_MS } from "#config";
import { isWsEvent, type WsEvent } from "#types";
import { sleep } from "#utils";

/**
 * WebSocket subscription to one room's event stream.
 *
 * The client owns reconnect with backoff (delays from `RECONNECT_DELAYS_MS`),
 * delivers parsed `WsEvent`s through `onEvent`, and exposes connection
 * status changes via `onConnected` / `onDisconnected`.
 *
 * Reconnect attempts are cumulative across the session; the dashboard
 * surfaces them as a "Reconnecting #N" badge.
 */
export interface RoomClientCallbacks {
  onConnected: () => void;
  onDisconnected: (attempt: number) => void;
  onEvent: (event: WsEvent) => void;
  onError: (message: string) => void;
}

export class RoomClient {
  #callbacks: RoomClientCallbacks;
  #roomId: string | null = null;
  #socket: WebSocket | null = null;
  #disposed = false;

  constructor(callbacks: RoomClientCallbacks) {
    this.#callbacks = callbacks;
  }

  /**
   * Disconnect any prior subscription and start streaming `roomId`. Safe to
   * call repeatedly with different ids; the previous connection is torn
   * down first.
   */
  connect(roomId: string): void {
    this.disconnect();
    this.#roomId = roomId;
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
    if (this.#roomId === null) {
      return;
    }
    let attempt = 0;
    while (!this.#disposed) {
      const url = `${BACKEND_BASE_URL.replace(
        "http",
        "ws",
      )}/v1/rooms/${this.#roomId}/stream`;
      const socket = new WebSocket(url);
      this.#socket = socket;
      const opened = await this.#waitForOpen(socket);
      if (!opened) {
        attempt += 1;
        this.#callbacks.onDisconnected(attempt);
        await this.#waitForReconnect(attempt);
        continue;
      }
      attempt = 0;
      this.#callbacks.onConnected();
      const closeEvent = await this.#consumeMessages(socket);
      if (this.#disposed) {
        return;
      }
      if (closeEvent !== null && closeEvent.code === 1000) {
        return;
      }
      attempt += 1;
      this.#callbacks.onDisconnected(attempt);
      await this.#waitForReconnect(attempt);
    }
  }

  async #waitForOpen(socket: WebSocket): Promise<boolean> {
    const opened = await new Promise<boolean>((resolve): void => {
      socket.addEventListener("open", (): void => {
        resolve(true);
      });
      socket.addEventListener("error", (): void => {
        resolve(false);
      });
      socket.addEventListener("close", (): void => {
        resolve(false);
      });
    });
    return opened;
  }

  async #consumeMessages(socket: WebSocket): Promise<CloseEvent | null> {
    socket.addEventListener("message", (event: MessageEvent<unknown>): void => {
      this.#handleMessage(event.data);
    });
    socket.addEventListener("error", (): void => {
      this.#callbacks.onError("WebSocket connection error.");
    });
    const closeEvent = await new Promise<CloseEvent>((resolve): void => {
      socket.addEventListener("close", resolve);
    });
    return closeEvent;
  }

  #handleMessage(data: unknown): void {
    let parsed: unknown = null;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : null;
    } catch {
      parsed = null;
    }
    if (isWsEvent(parsed)) {
      this.#callbacks.onEvent(parsed);
    } else {
      this.#callbacks.onError("Failed to parse event payload.");
    }
  }

  async #waitForReconnect(attempt: number): Promise<void> {
    const index = Math.min(attempt - 1, RECONNECT_DELAYS_MS.length - 1);
    const delayMs = RECONNECT_DELAYS_MS[index] ?? 8000;
    await sleep(delayMs);
  }
}
