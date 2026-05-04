import { dashboardContext } from "@/app/context";
import type { DashboardState, DashboardStore } from "@/app/state";
import type { Room, RoomStatus } from "@/app/types";
import { formatTimestamp, roomStatusToText } from "@/app/utils";
import { consume } from "@lit/context";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import "./create-room-dialog.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-list-page": RoomListPage;
  }
}

/**
 * Top-level page for `/`. Lists every loaded room and lets the user open
 * one (navigates to `/room/:slug`) or create a new one (opens the
 * create-room dialog). Owns no chat state of its own; the dashboard
 * provider supplies the rooms list via context.
 */
@customElement("te-room-list-page")
export class RoomListPage extends LitElement {
  @consume({ context: dashboardContext, subscribe: true })
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor dashboardState: DashboardState | null = null;

  @state()
  private accessor showCreateDialog = false;

  #unsubscribe: (() => void) | null = null;

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--wa-color-surface-default);
      padding: 1.2rem;
      box-sizing: border-box;
    }

    .container {
      max-width: 80rem;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    .tagline {
      font-size: 0.85rem;
      color: var(--wa-color-text-quiet);
    }

    .actions {
      margin-left: auto;
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .room-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .room-card {
      display: grid;
      gap: 0.4rem;
      padding: 0.85rem 1rem;
      border-radius: 0.6rem;
      background: var(--wa-color-surface-raised);
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .room-card:hover {
      border-color: var(--wa-color-brand-border-normal);
    }

    .room-name {
      font-size: 0.95rem;
      font-weight: 600;
    }

    .room-topic {
      font-size: 0.8rem;
      color: var(--wa-color-text-quiet);
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .room-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.2rem;
    }

    .room-time {
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
    }

    .empty {
      padding: 3rem 1rem;
      text-align: center;
      color: var(--wa-color-text-quiet);
      font-size: 0.95rem;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#bindStore();
    this.store?.clearSelection();
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("store")) {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#bindStore();
    }
  }

  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    super.disconnectedCallback();
  }

  override render() {
    const rooms = this.dashboardState?.rooms ?? [];
    return html`
      <div class="container">
        <header class="header">
          <span class="logo">Vemium</span>
          <span class="tagline">Endless agent debate</span>
          <span class="actions">
            <wa-button size="small" @click="${this.#openCreate}">
              + New room
            </wa-button>
          </span>
        </header>
        ${rooms.length === 0
          ? html`
            <p class="empty">
              No rooms yet. Create one to start a debate.
            </p>
          `
          : this.#renderRoomGrid(rooms)}
        <te-create-room-dialog
          .store="${this.store}"
          ?open="${this.showCreateDialog}"
          @te-close="${this.#closeCreate}"
          @te-room-created="${this.#onRoomCreated}"
        ></te-create-room-dialog>
      </div>
    `;
  }

  #renderRoomGrid(rooms: Room[]) {
    return html`
      <ul class="room-grid">
        ${rooms.map((room) =>
          html`
            <li>
              <a
                class="room-card"
                href="/room/${room.slug}"
                @click="${(e: MouseEvent): void => this.#onRoomClick(e, room)}"
              >
                <span class="room-name">${room.name}</span>
                ${room.topic !== ""
                  ? html`
                    <span class="room-topic">${room.topic}</span>
                  `
                  : nothing}
                <span class="room-meta">
                  <span class="room-time">${formatTimestamp(
                    room.createdAt,
                  )}</span>
                  ${this.#renderStatusBadge(room.status)}
                </span>
              </a>
            </li>
          `
        )}
      </ul>
    `;
  }

  #renderStatusBadge(status: RoomStatus) {
    return html`
      <wa-badge size="small" appearance="outlined">
        ${roomStatusToText(status)}
      </wa-badge>
    `;
  }

  #onRoomClick(event: MouseEvent, room: Room): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    this.#navigateToRoom(room.slug);
  }

  #navigateToRoom(slug: string): void {
    const url = `/room/${slug}`;
    globalThis.history.pushState({}, "", url);
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
  }

  #openCreate(): void {
    this.showCreateDialog = true;
  }

  #closeCreate(): void {
    this.showCreateDialog = false;
  }

  #onRoomCreated(event: CustomEvent<{ room: Room }>): void {
    this.showCreateDialog = false;
    this.#navigateToRoom(event.detail.room.slug);
  }

  #bindStore(): void {
    if (this.#unsubscribe !== null || this.store === undefined) {
      return;
    }
    this.#unsubscribe = this.store.subscribe((): void => {
      this.dashboardState = this.store.getState();
    });
    this.dashboardState = this.store.getState();
  }
}
