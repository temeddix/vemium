import { BACKEND_BASE_URL } from "@/app/config";
import type { RoomEvent } from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-event-hovercard": EventHovercard;
  }
}

interface WaPopupEl extends HTMLElement {
  active: boolean;
  anchor: Element | null;
}

const eventCache = new Map<number, RoomEvent>();

/**
 * Arrow popup that previews a room event by `#N` id.
 * The host component sets `anchorEl` and `active`; this component fetches
 * the event on demand and renders a `<wa-popup placement="top" arrow>` card.
 */
@customElement("te-event-hovercard")
export class EventHovercard extends LitElement {
  @property({ attribute: false })
  accessor anchorEl: Element | null = null;

  @property({ type: Number, attribute: "event-id" })
  accessor eventId: number | null = null;

  @property({ type: String, attribute: "room-code" })
  accessor roomCode = "";

  @property({ type: Boolean })
  accessor active = false;

  @state()
  private accessor _event: RoomEvent | null = null;

  @state()
  private accessor _loading = false;

  #popupEl: WaPopupEl | null = null;

  static override styles = css`
    :host {
      display: contents;
    }

    wa-popup::part(popup) {
      background: var(--wa-color-surface-raised);
      border: 1px solid var(--wa-color-neutral-border-normal);
      border-radius: 0.5rem;
      box-shadow: var(--wa-shadow-m);
    }

    wa-popup::part(arrow) {
      background: var(--wa-color-surface-raised);
      border: 1px solid var(--wa-color-neutral-border-normal);
    }

    .card {
      padding: 0.6rem 0.75rem;
      min-width: 12rem;
      max-width: 22rem;
      font-size: 0.8rem;
      line-height: 1.4;
      pointer-events: none;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.35rem;
    }

    .agent {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--wa-color-text-normal);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-body {
      color: var(--wa-color-text-normal);
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
    }

    .loading {
      color: var(--wa-color-text-quiet);
      font-style: italic;
    }
  `;

  override updated(changed: Map<string, unknown>): void {
    if (this.#popupEl !== null) {
      this.#popupEl.anchor = this.anchorEl;
    }
    if (
      (changed.has("active") || changed.has("eventId")) &&
      this.active &&
      this.eventId !== null
    ) {
      this.#fetchEvent(this.eventId);
    }
  }

  async #fetchEvent(id: number): Promise<void> {
    const cached = eventCache.get(id);
    if (cached !== undefined) {
      this._event = cached;
      return;
    }
    this._loading = true;
    try {
      const resp = await fetch(
        `${BACKEND_BASE_URL}/v1/rooms/${this.roomCode}/events/${id}`,
      );
      if (resp.ok) {
        const data = (await resp.json()) as { event: RoomEvent };
        eventCache.set(id, data.event);
        this._event = data.event;
      }
    } finally {
      this._loading = false;
    }
  }

  override render() {
    return html`
      <wa-popup
        ${ref((el) => {
          this.#popupEl = (el as WaPopupEl) ?? null;
          if (this.#popupEl !== null) {
            this.#popupEl.anchor = this.anchorEl;
          }
        })}
        placement="top"
        arrow
        ?active="${this.active}"
        distance="8"
        strategy="fixed"
      >
        <div class="card">
          ${this._loading
            ? html`
              <span class="loading">Loading...</span>
            `
            : this.#renderCard()}
        </div>
      </wa-popup>
    `;
  }

  #renderCard() {
    const ev = this._event;
    if (ev === null) {
      return nothing;
    }
    const body = ev.detail !== "" ? ev.detail : ev.content;
    return html`
      ${ev.agent !== null
        ? html`
          <div class="card-header">
            <span class="agent">${ev.agent}</span>
          </div>
        `
        : nothing}
      <div class="card-body">${body}</div>
    `;
  }
}
