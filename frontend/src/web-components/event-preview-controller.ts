import type { ReactiveController, ReactiveControllerHost } from "lit";

import { BACKEND_BASE_URL } from "#config";
import { isRoomEventEnvelope, type RoomEvent } from "#types";

/** Every event fetched so far, by id, shared by all previews. */
const EVENT_CACHE = new Map<number, RoomEvent>();

/**
 * Loads the room event a hovercard previews. Results are cached for the
 * session, and a request still in flight when the host leaves the document
 * is aborted.
 */
export class EventPreviewController implements ReactiveController {
  #host: ReactiveControllerHost;
  #scope: AbortController = new AbortController();

  /** The event last loaded, or null before the first one arrives. */
  event: RoomEvent | null = null;

  /** Whether a request is in flight. */
  loading: boolean = false;

  constructor(host: ReactiveControllerHost) {
    this.#host = host;
    host.addController(this);
  }

  /** Shows event `id` of room `roomCode`, from the cache when possible. */
  async load(roomCode: string, id: number): Promise<void> {
    const cached = EVENT_CACHE.get(id);
    if (cached !== undefined) {
      this.event = cached;
      this.#host.requestUpdate();
      return;
    }
    this.loading = true;
    this.#host.requestUpdate();
    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${roomCode}/events/${id}`,
        { signal: this.#scope.signal },
      );
      if (response.ok) {
        const payload: unknown = await response.json();
        if (isRoomEventEnvelope(payload)) {
          EVENT_CACHE.set(id, payload.event);
          this.event = payload.event;
        }
      }
    } catch {
      // A failed or aborted preview just shows nothing new.
    } finally {
      this.loading = false;
      this.#host.requestUpdate();
    }
  }

  hostConnected(): void {
    // A reconnected host gets a fresh scope; an aborted signal rejects
    // every request made through it.
    this.#scope = new AbortController();
  }

  hostDisconnected(): void {
    this.#scope.abort();
  }
}
