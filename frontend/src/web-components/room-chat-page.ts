import {
  formatDuration,
  formatSeparatorTimestamp,
  shouldShowTimeSeparator,
} from "@/app/chat";
import { dashboardContext } from "@/app/context";
import type { DashboardState, DashboardStore } from "@/app/state";
import type { Room, RoomEvent, RoomView } from "@/app/types";
import { consume } from "@lit/context";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";
import { repeat } from "lit/directives/repeat.js";

import "./chat-composer.ts";
import "./chat-message.ts";
import { nextCronTick } from "./cron-picker.ts";
import "./room-files-dialog.ts";
import "./room-reports-dialog.ts";
import "./room-settings-dialog.ts";

interface DetailDialogState {
  author: string;
  label: string;
  body: string;
  duration: string;
}

declare global {
  interface HTMLElementTagNameMap {
    "te-room-chat-page": RoomChatPage;
  }
}

/**
 * Top-level page for `/room/:code`. Owns the chat-stream subscription
 * lifecycle (delegated to the store) and renders the timeline plus the
 * human composer. The timeline is a flat list of [`RoomEvent`] rows; all
 * kinds (bubbles, thinking, tool inline notes) render via
 * [`te-chat-message`], which switches body shape by `event.kind`.
 */
@customElement("te-room-chat-page")
export class RoomChatPage extends LitElement {
  @consume({ context: dashboardContext, subscribe: true })
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @property({ type: String })
  accessor code = "";

  @state()
  private accessor dashboardState: DashboardState | null = null;

  @state()
  private accessor sending = false;

  @state()
  private accessor detailDialog: DetailDialogState | null = null;

  /** Wall-clock tick used to redraw the paused-room countdown each second. */
  @state()
  private accessor nowMillis = Date.now();

  #countdownInterval: ReturnType<typeof setInterval> | null = null;

  #detailDialogRef: Ref<HTMLElement & { open: boolean }> = createRef();

  #settingsDialogRef: Ref<HTMLElementTagNameMap["te-room-settings-dialog"]> =
    createRef();

  #reportsDialogRef: Ref<HTMLElementTagNameMap["te-room-reports-dialog"]> =
    createRef();

  #filesDialogRef: Ref<HTMLElementTagNameMap["te-room-files-dialog"]> =
    createRef();

  #unsubscribe: (() => void) | null = null;

  /** Tracks the last selected code so `selectRoom` only fires on changes. */
  #lastSelectedCode: string | null = null;

  /**
   * Tracks whether the user is currently anchored to the bottom of the
   * scroll viewport. Auto-scroll only fires when this is true.
   */
  #pinnedToBottom = true;

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--wa-color-surface-default);
      box-sizing: border-box;
      overflow-x: clip;
    }

    .container {
      max-width: 80rem;
      margin: 0 auto;
      padding: 0 1.2rem;
      box-sizing: border-box;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.4rem 0;
      position: sticky;
      top: 0;
      background: var(--wa-color-surface-default);
      z-index: 2;
    }

    .back-button {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--wa-color-text-normal);
      padding: 0.3rem;
      display: grid;
      place-items: center;
      border-radius: 0.4rem;
      font: inherit;
      flex-shrink: 0;
    }

    .back-button:hover {
      background: var(--wa-color-fill-quiet);
    }

    .title {
      flex: 1;
      min-width: 0;
    }

    .room-topic {
      font-size: 1rem;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .scroll {
      padding: 0.4rem 0 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      flex: 1;
    }

    .time-separator {
      align-self: center;
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
      padding: 0.5rem 0;
    }

    .empty {
      flex: 1;
      display: grid;
      place-items: center;
      color: var(--wa-color-text-quiet);
      font-size: 0.9rem;
    }

    .composer-wrap {
      padding: 0.2rem 0 0.4rem;
      position: sticky;
      bottom: 0;
      background: var(--wa-color-surface-default);
      z-index: 2;
    }

    .paused-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.2rem 0;
      font-size: 0.75rem;
      color: var(--wa-color-text-quiet);
    }

    .paused-banner-countdown {
      font-family: var(--wa-font-family-code, ui-monospace, monospace);
      font-variant-numeric: tabular-nums;
    }

    .error-banner {
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      background: var(--wa-color-danger-fill-quiet);
      color: var(--wa-color-danger-on-quiet);
      font-size: 0.85rem;
      margin-top: 0.4rem;
    }

    .detail-dialog-author {
      font-size: 0.78rem;
      color: var(--wa-color-text-quiet);
      margin-bottom: 0.4rem;
    }

    .detail-dialog-duration {
      font-size: 0.78rem;
      color: var(--wa-color-text-quiet);
      margin-bottom: 0.4rem;
      font-variant-numeric: tabular-nums;
    }

    .detail-dialog-body {
      font-size: 0.9rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      font-family: var(--wa-font-family-code, ui-monospace, monospace);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#bindStore();
    globalThis.addEventListener("scroll", this.#onWindowScroll, {
      passive: true,
    });
    this.nowMillis = Date.now();
    this.#countdownInterval = setInterval((): void => {
      this.nowMillis = Date.now();
    }, 1000);
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("store")) {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#bindStore();
    }
    this.#syncSelection();
    if (this.#pinnedToBottom) {
      this.#scrollToBottom();
    }
  }

  override disconnectedCallback(): void {
    globalThis.removeEventListener("scroll", this.#onWindowScroll);
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    if (this.#countdownInterval !== null) {
      clearInterval(this.#countdownInterval);
      this.#countdownInterval = null;
    }
    super.disconnectedCallback();
  }

  override render() {
    const view = this.#currentView();
    if (view === null) {
      return this.#renderResolving();
    }
    const { room } = view;
    const events = view.events;
    const topicLabel = room.topic.trim() === "" ? room.code : room.topic;
    return html`
      <div class="container">
        <header class="header">
          <button class="back-button" @click="${this.#onBack}" title="Back">
            <wa-icon name="chevron-left"></wa-icon>
          </button>
          <div class="title">
            <div class="room-topic">${topicLabel}</div>
          </div>
          <wa-switch
            size="small"
            ?checked="${room.roomState === "active"}"
            @wa-change="${(): Promise<void> => this.#onToggleActivation(room)}"
          ></wa-switch>
          <wa-dropdown placement="bottom-end">
            <wa-button
              slot="trigger"
              size="small"
              appearance="plain"
              title="More actions"
            >
              <wa-icon name="ellipsis-vertical"></wa-icon>
            </wa-button>
            <wa-dropdown-item
              @click="${(): void => this.#settingsDialogRef.value?.show(room)}"
            >
              Settings
            </wa-dropdown-item>
            <wa-dropdown-item
              @click="${(): void => this.#reportsDialogRef.value?.show()}"
            >
              Reports
            </wa-dropdown-item>
            <wa-dropdown-item
              @click="${(): Promise<void> | undefined =>
                this.#filesDialogRef.value?.show(room.code)}"
            >
              Files
            </wa-dropdown-item>
            <wa-dropdown-item
              variant="danger"
              @click="${(): Promise<void> => this.#confirmDelete(room.code)}"
            >
              Delete
            </wa-dropdown-item>
          </wa-dropdown>
        </header>
        ${this.#renderScrollArea(events)}
        <div class="composer-wrap">
          ${this.#renderPausedBanner(room)}
          <te-chat-composer
            ?disabled="${this.sending}"
            @te-send="${this.#onSend}"
          ></te-chat-composer>
          ${this.dashboardState?.errorMessage
            ? html`
              <div class="error-banner">
                ${this.dashboardState.errorMessage}
              </div>
            `
            : nothing}
        </div>
      </div>
      <te-room-settings-dialog
        ${ref(this.#settingsDialogRef)}
        .store="${this.store}"
      ></te-room-settings-dialog>
      <te-room-reports-dialog
        ${ref(this.#reportsDialogRef)}
        .reports="${view.reports}"
      ></te-room-reports-dialog>
      <te-room-files-dialog
        ${ref(this.#filesDialogRef)}
        .store="${this.store}"
      ></te-room-files-dialog>
      <wa-dialog
        ${ref(this.#detailDialogRef)}
        label="${this.detailDialog?.label ?? ""}"
      >
        ${this.detailDialog === null ? nothing : html`
          <div class="detail-dialog-author">${this.detailDialog.author}</div>
          <div class="detail-dialog-duration">
            Took ${this.detailDialog.duration}
          </div>
          <div class="detail-dialog-body">${this.detailDialog.body}</div>
        `}
      </wa-dialog>
    `;
  }

  #renderResolving() {
    const state = this.dashboardState;
    if (state === null || state.rooms.length === 0) {
      return html`
        <div class="container">
          <p class="empty">Loading...</p>
        </div>
      `;
    }
    return html`
      <div class="container">
        <p class="empty">
          No room with code "${this.code}".
          <wa-button size="small" @click="${this.#onBack}">
            Back to rooms
          </wa-button>
        </p>
      </div>
    `;
  }

  #renderPausedBanner(room: Room) {
    if (room.debateState !== "paused" || room.roomState !== "active") {
      return nothing;
    }
    const nextTick = nextCronTick(
      room.resumeScheduleCron,
      new Date(this.nowMillis),
    );
    const countdownText = nextTick === null
      ? null
      : formatCountdown(nextTick.getTime() - this.nowMillis);
    return html`
      <div class="paused-banner" role="status">
        <span>
          ${countdownText === null
            ? html`
              Paused - the leader will check back at the next scheduled time.
            `
            : html`
              Paused - the leader will come back after
              <span class="paused-banner-countdown">${countdownText}</span>.
            `}
        </span>
      </div>
    `;
  }

  #renderScrollArea(events: RoomEvent[]) {
    if (events.length === 0) {
      return html`
        <div class="empty">
          No messages yet. Say hello to start the debate.
        </div>
      `;
    }
    return html`
      <div class="scroll" @te-open-detail="${this.#onOpenDetail}">
        ${repeat(
          events,
          (event) => entryKey(event),
          (event, idx) => this.#renderEntry(event, events, idx),
        )}
      </div>
    `;
  }

  #renderEntry(event: RoomEvent, events: RoomEvent[], idx: number) {
    const previous = idx > 0 ? events[idx - 1] : null;
    const showSeparator = shouldShowTimeSeparator(
      previous?.timestamp ?? null,
      event.timestamp,
    );
    const separator = showSeparator
      ? html`
        <div class="time-separator">
          ${formatSeparatorTimestamp(event.timestamp)}
        </div>
      `
      : nothing;
    return html`
      ${separator}
      <te-chat-message .event="${event}"></te-chat-message>
    `;
  }

  #onOpenDetail = (raw: Event): void => {
    const event = (raw as CustomEvent<RoomEvent>).detail;
    const author = event.agent ?? "";
    const finishedAt = event.completedAt !== null
      ? Date.parse(event.completedAt)
      : Date.now();
    const startedAt = Date.parse(event.timestamp);
    const elapsedMs = Number.isNaN(startedAt) || Number.isNaN(finishedAt)
      ? 0
      : Math.max(0, finishedAt - startedAt);
    this.detailDialog = {
      author,
      label: event.content,
      body: event.detail,
      duration: formatDuration(elapsedMs),
    };
    const dialog = this.#detailDialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  };

  // -- Actions ------------------------------------------------------------

  async #onToggleActivation(room: Room): Promise<void> {
    if (room.roomState === "deactivated") {
      await this.store.activateRoom(room.code);
    } else {
      await this.store.deactivateRoom(room.code);
    }
  }

  #onBack(): void {
    globalThis.history.pushState({}, "", "/");
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
  }

  async #onSend(event: CustomEvent<{ content: string }>): Promise<void> {
    const view = this.#currentView();
    if (view === null || this.sending) {
      return;
    }
    this.sending = true;
    try {
      await this.store.sendUserMessage(view.room.code, event.detail.content);
      this.#pinnedToBottom = true;
    } finally {
      this.sending = false;
    }
  }

  async #confirmDelete(code: string): Promise<void> {
    const ok = globalThis.confirm("Delete this room? This cannot be undone.");
    if (!ok) {
      return;
    }
    await this.store.deleteRoom(code);
    this.#onBack();
  }

  #onWindowScroll = (): void => {
    const scrollTop = globalThis.scrollY;
    const viewport = globalThis.innerHeight;
    const total = document.documentElement.scrollHeight;
    const distanceFromBottom = total - scrollTop - viewport;
    this.#pinnedToBottom = distanceFromBottom < 64;
  };

  // -- Selection plumbing -------------------------------------------------

  #syncSelection(): void {
    if (this.store === undefined) {
      return;
    }
    if (this.#lastSelectedCode === this.code) {
      return;
    }
    const room = this.store.findRoomByCode(this.code);
    if (room === null) {
      return;
    }
    this.#lastSelectedCode = this.code;
    this.store.selectRoom(room.code);
  }

  #scrollToBottom(): void {
    globalThis.scrollTo({ top: document.documentElement.scrollHeight });
  }

  #currentView(): RoomView | null {
    const state = this.dashboardState;
    if (state === null) {
      return null;
    }
    const room = this.store?.findRoomByCode(this.code);
    if (!room) {
      return null;
    }
    return state.views[room.code] ?? null;
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

/**
 * Stable identity for the `repeat` directive. Prefer the row's database
 * id so reconnects (which replay the same row from snapshot) reuse the
 * same DOM and don't reset scroll / streaming-body state. Falls back to
 * a sequence-derived key for the rare in-memory event without an id.
 */
function entryKey(event: RoomEvent): string {
  return event.id !== null ? `r-${event.id}` : `s-${event.sequence}`;
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad2 = (n: number): string => n < 10 ? `0${n}` : `${n}`;
  const clock = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  if (days === 0) {
    return clock;
  }
  const dayLabel = days === 1 ? "day" : "days";
  return `${days} ${dayLabel} and ${clock}`;
}
