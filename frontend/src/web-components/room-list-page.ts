import { dashboardContext } from "@/app/context";
import type { DashboardState, DashboardStore } from "@/app/state";
import type { Room } from "@/app/types";
import { formatTimestamp } from "@/app/utils";
import { consume } from "@lit/context";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import "./clone-room-dialog.ts";
import "./create-room-dialog.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-list-page": RoomListPage;
  }
}

interface DialogElement extends HTMLElement {
  open: boolean;
}

/**
 * Top-level page for `/`. Lists every loaded room and lets the user open
 * one (navigates to `/room/:code`), create a new one (opens the
 * create-room dialog), or jump to global settings.
 *
 * The room actions live behind a `...` dropdown so the header collapses
 * cleanly on narrow viewports without sacrificing the desktop affordance.
 */
@customElement("te-room-list-page")
export class RoomListPage extends LitElement {
  @consume({ context: dashboardContext, subscribe: true })
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor dashboardState: DashboardState | null = null;

  #createDialogRef: Ref<HTMLElementTagNameMap["te-create-room-dialog"]> =
    createRef();

  #cloneDialogRef: Ref<HTMLElementTagNameMap["te-clone-room-dialog"]> =
    createRef();

  #deleteDialogRef: Ref<DialogElement> = createRef();

  @state()
  private accessor pendingDelete: Room | null = null;

  @state()
  private accessor isDeleting = false;

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

    .menu-button-wrap {
      margin-left: auto;
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
      position: relative;
      display: grid;
      gap: 0.4rem;
      padding: 0.85rem 1rem;
      border-radius: 0.6rem;
      background: var(--wa-color-surface-raised);
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
    }

    .room-card:hover {
      border-color: var(--wa-color-brand-border-normal);
    }

    .room-card-link {
      display: grid;
      gap: 0.4rem;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }

    .room-card-menu {
      position: absolute;
      top: 0.3rem;
      right: 0.3rem;
      display: inline-flex;
    }

    .room-topic {
      font-size: 0.95rem;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .room-code {
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
      font-family: var(--wa-font-family-code, ui-monospace, monospace);
    }

    .room-topic-row {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding-right: 1.6rem;
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

    .delete-summary {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.5;
      color: var(--wa-color-text-normal);
    }

    .delete-topic {
      font-weight: 600;
    }

    .footer-row {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
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
          <div class="menu-button-wrap">
            <wa-dropdown placement="bottom-end">
              <wa-button slot="trigger" size="small" title="More actions">
                <wa-icon name="ellipsis-vertical"></wa-icon>
              </wa-button>
              <wa-dropdown-item @click="${this.#openCreate}">
                New room
              </wa-dropdown-item>
              <wa-dropdown-item @click="${this.#openSettings}">
                Settings
              </wa-dropdown-item>
            </wa-dropdown>
          </div>
        </header>
        ${rooms.length === 0
          ? html`
            <p class="empty">
              No rooms yet. Create one to start a debate.
            </p>
          `
          : this.#renderRoomGrid(rooms)}
        <te-create-room-dialog
          ${ref(this.#createDialogRef)}
          .store="${this.store}"
          @te-room-created="${this.#onRoomCreated}"
        ></te-create-room-dialog>
        <te-clone-room-dialog
          ${ref(this.#cloneDialogRef)}
          .store="${this.store}"
          @te-cloned="${this.#onRoomCloned}"
        ></te-clone-room-dialog>
        ${this.#renderDeleteDialog()}
      </div>
    `;
  }

  #renderDeleteDialog() {
    const room = this.pendingDelete;
    const sourceLabel = room === null
      ? ""
      : (room.topic.trim() === "" ? room.code : room.topic);
    return html`
      <wa-dialog ${ref(this.#deleteDialogRef)} label="Delete room">
        ${room === null ? nothing : html`
          <p class="delete-summary">
            Permanently delete
            <span class="delete-topic">${sourceLabel}</span>? Chat history, reports, and
            workspace files for this room will be removed. This cannot be undone.
          </p>
        `}
        <div slot="footer" class="footer-row">
          <wa-button
            size="small"
            ?disabled="${this.isDeleting}"
            @click="${this.#onDeleteCancel}"
          >
            Cancel
          </wa-button>
          <wa-button
            size="small"
            variant="danger"
            ?disabled="${this.isDeleting}"
            @click="${this.#onDeleteConfirm}"
          >
            Delete
          </wa-button>
        </div>
      </wa-dialog>
    `;
  }

  #renderRoomGrid(rooms: Room[]) {
    return html`
      <ul class="room-grid">
        ${rooms.map((room) =>
          html`
            <li class="room-card">
              <a
                class="room-card-link"
                href="/room/${room.code}"
                @click="${(e: MouseEvent): void => this.#onRoomClick(e, room)}"
              >
                ${room.topic !== ""
                  ? html`
                    <span class="room-topic-row">
                      <span class="room-topic">${room.topic}</span>
                    </span>
                  `
                  : nothing}
                <span class="room-code">${room.code}</span>
                <span class="room-meta">
                  <span class="room-time">${formatTimestamp(
                    room.createdAt,
                  )}</span>
                  <span
                    @click="${(e: MouseEvent): void => e.stopPropagation()}"
                  >
                    <wa-switch
                      size="small"
                      ?checked="${room.roomState === "active"}"
                      @change="${(): Promise<void> =>
                        this.store.toggleRoomActivation(room)}"
                    ></wa-switch>
                  </span>
                </span>
              </a>
              <span class="room-card-menu">
                <wa-dropdown placement="bottom-end">
                  <wa-button
                    slot="trigger"
                    size="small"
                    appearance="plain"
                    title="Room actions"
                  >
                    <wa-icon name="ellipsis-vertical"></wa-icon>
                  </wa-button>
                  <wa-dropdown-item
                    @click="${(): void => this.#openClone(room)}"
                  >
                    Duplicate
                  </wa-dropdown-item>
                  <wa-dropdown-item
                    @click="${(): void => this.#openDelete(room)}"
                  >
                    Delete
                  </wa-dropdown-item>
                </wa-dropdown>
              </span>
            </li>
          `
        )}
      </ul>
    `;
  }

  #onRoomClick(event: MouseEvent, room: Room): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    this.#navigateToRoom(room.code);
  }

  #navigateToRoom(code: string): void {
    const url = `/room/${code}`;
    globalThis.history.pushState({}, "", url);
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
  }

  #openCreate = (): void => {
    this.#createDialogRef.value?.show();
  };

  #openSettings = (): void => {
    globalThis.history.pushState({}, "", "/settings");
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
  };

  #onRoomCreated(event: CustomEvent<{ room: Room }>): void {
    this.#navigateToRoom(event.detail.room.code);
  }

  #openClone(room: Room): void {
    this.#cloneDialogRef.value?.show(room);
  }

  #onRoomCloned(event: CustomEvent<{ room: Room }>): void {
    this.#navigateToRoom(event.detail.room.code);
  }

  #openDelete(room: Room): void {
    this.pendingDelete = room;
    this.isDeleting = false;
    const dialog = this.#deleteDialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  }

  #onDeleteCancel = (): void => {
    const dialog = this.#deleteDialogRef.value;
    if (dialog !== undefined) {
      dialog.open = false;
    }
    this.pendingDelete = null;
  };

  #onDeleteConfirm = async (): Promise<void> => {
    const room = this.pendingDelete;
    if (room === null || this.isDeleting) {
      return;
    }
    this.isDeleting = true;
    await this.store.deleteRoom(room.code);
    this.isDeleting = false;
    const dialog = this.#deleteDialogRef.value;
    if (dialog !== undefined) {
      dialog.open = false;
    }
    this.pendingDelete = null;
  };

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
