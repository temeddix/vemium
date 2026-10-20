import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@awesome.me/webawesome/dist/components/dropdown/dropdown.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/switch/switch.js";
import { consume } from "@lit/context";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import { dashboardContext } from "#context";
import type { DashboardState, DashboardStore } from "#state";
import type { Room, RoomEnvelope } from "#types";
import { formatTimestamp, navigateTo } from "#utils";

import "./clone-room-dialog.ts";
import "./create-room-dialog.ts";
import { StoreController } from "./store-controller.ts";
import { UpdateEffectController } from "./update-effect-controller.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-list-page": RoomListPageElement;
  }
}

interface DialogElement extends HTMLElement {
  open: boolean;
}

/**
 * Top-level page for `/`. Lists every loaded room and lets the user open
 * one (navigates to `/:code`), create a new one (opens the
 * create-room dialog), or jump to global settings.
 *
 * The room actions live behind a `...` dropdown so the header collapses
 * cleanly on narrow viewports without sacrificing the desktop affordance.
 */
@customElement("te-room-list-page")
export class RoomListPageElement extends LitElement {
  @consume({ context: dashboardContext, subscribe: true })
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  accessor dashboardState: DashboardState | null = null;

  #createDialogRef: Ref<HTMLElementTagNameMap["te-create-room-dialog"]> =
    createRef();

  #cloneDialogRef: Ref<HTMLElementTagNameMap["te-clone-room-dialog"]> =
    createRef();

  #deleteDialogRef: Ref<DialogElement> = createRef();

  @state()
  accessor pendingDelete: Room | null = null;

  @state()
  accessor isDeleting = false;

  storeSubscription: StoreController = new StoreController(this).track(
    (): DashboardStore | null => this.store,
    (next: DashboardState): void => {
      this.dashboardState = next;
    },
  );

  // The list page shows no room, so entering it drops the selection.
  effects: UpdateEffectController = new UpdateEffectController(
    this,
  ).onConnected((): void => {
    this.store?.clearSelection();
  });

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
      min-width: 0;
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
      min-width: 0;
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
      min-width: 0;
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

  override render(): TemplateResult {
    const rooms = this.dashboardState?.rooms ?? [];
    const roomList =
      rooms.length === 0
        ? html`
          <p class="empty">No rooms yet. Create one to start a debate.</p>
        `
        : this.#renderRoomGrid(rooms);
    const createDialogRef = ref(this.#createDialogRef);
    const cloneDialogRef = ref(this.#cloneDialogRef);
    const deleteDialog = this.#renderDeleteDialog();
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
        ${roomList}
        <te-create-room-dialog
          ${createDialogRef}
          .store="${this.store}"
          @te-room-created="${this.#onRoomCreated}"
        ></te-create-room-dialog>
        <te-clone-room-dialog
          ${cloneDialogRef}
          .store="${this.store}"
          @te-cloned="${this.#onRoomCloned}"
        ></te-clone-room-dialog>
        ${deleteDialog}
      </div>
    `;
  }

  #renderDeleteDialog(): TemplateResult {
    const room = this.pendingDelete;
    const dialogRef = ref(this.#deleteDialogRef);
    const label = room === null ? "" : roomLabel(room);
    const summary =
      room === null
        ? nothing
        : html`
          <p class="delete-summary">
            Permanently delete
            <span class="delete-topic">${label}</span>? Chat history,
            reports, and workspace files for this room will be removed. This
            cannot be undone.
          </p>
        `;
    return html`
      <wa-dialog ${dialogRef} label="Delete room">
        ${summary}
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

  #renderRoomGrid(rooms: Room[]): TemplateResult {
    const cards = rooms.map((room) => this.#renderRoomCard(room));
    return html`
      <ul class="room-grid">${cards}</ul>
    `;
  }

  #renderRoomCard(room: Room): TemplateResult {
    const topicRow =
      room.topic === ""
        ? nothing
        : html`
          <span class="room-topic-row">
            <span class="room-topic">${room.topic}</span>
          </span>
        `;
    const createdAt = formatTimestamp(room.createdAt);
    const active = room.roomState === "ACTIVE";
    return html`
      <li class="room-card">
        <a
          class="room-card-link"
          href="/${room.code}"
          data-code="${room.code}"
          @click="${this.#onRoomClick}"
        >
          ${topicRow}
          <span class="room-code">${room.code}</span>
          <span class="room-meta">
            <span class="room-time">${createdAt}</span>
            <span @click="${stopPropagation}">
              <wa-switch
                size="small"
                data-code="${room.code}"
                ?checked="${active}"
                @change="${this.#onToggleActivation}"
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
              data-code="${room.code}"
              @click="${this.#openClone}"
            >
              Duplicate
            </wa-dropdown-item>
            <wa-dropdown-item
              data-code="${room.code}"
              @click="${this.#openDelete}"
            >
              Delete
            </wa-dropdown-item>
          </wa-dropdown>
        </span>
      </li>
    `;
  }

  /** The room whose card holds the element an event was bound on. */
  #roomOf(event: Event): Room | null {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return null;
    }
    const code = target.dataset["code"] ?? "";
    return this.store.findRoomByCode(code);
  }

  #onToggleActivation = async (event: Event): Promise<void> => {
    const room = this.#roomOf(event);
    if (room !== null) {
      await this.store.toggleRoomActivation(room);
    }
  };

  #onRoomClick = (event: MouseEvent): void => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const room = this.#roomOf(event);
    if (room === null) {
      return;
    }
    event.preventDefault();
    navigateTo(`/${room.code}`);
  };

  #openCreate = (): void => {
    this.#createDialogRef.value?.show();
  };

  #openSettings = (): void => {
    navigateTo("/settings");
  };

  #onRoomCreated = (event: CustomEvent<RoomEnvelope>): void => {
    navigateTo(`/${event.detail.room.code}`);
  };

  #openClone = (event: Event): void => {
    const room = this.#roomOf(event);
    if (room !== null) {
      this.#cloneDialogRef.value?.show(room);
    }
  };

  #onRoomCloned = (event: CustomEvent<RoomEnvelope>): void => {
    navigateTo(`/${event.detail.room.code}`);
  };

  #openDelete = (event: Event): void => {
    const room = this.#roomOf(event);
    if (room === null) {
      return;
    }
    this.pendingDelete = room;
    this.isDeleting = false;
    const dialog = this.#deleteDialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  };

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
}

/** Keeps a click on a card's switch from following the card's link. */
function stopPropagation(event: Event): void {
  event.stopPropagation();
}

/** A room's display name: its topic, or its code when it has none. */
function roomLabel(room: Room): string {
  return room.topic.trim() === "" ? room.code : room.topic;
}
