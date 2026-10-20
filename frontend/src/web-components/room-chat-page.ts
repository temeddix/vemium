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
import { repeat } from "lit/directives/repeat.js";

import {
  formatDuration,
  formatSeparatorTimestamp,
  pad2,
  shouldShowTimeSeparator,
} from "#chat";
import { dashboardContext } from "#context";
import type { DashboardState, DashboardStore } from "#state";
import type { Room, RoomEvent, RoomView } from "#types";
import { navigateTo } from "#utils";

import "./chat-composer.ts";
import type { SendDetail } from "./chat-composer.ts";
import "./chat-message.ts";
import { nextCronTick } from "./cron-picker.ts";
import { IntervalController } from "./interval-controller.ts";
import "./room-files-dialog.ts";
import "./room-reports-dialog.ts";
import "./room-settings-dialog.ts";
import { StoreController } from "./store-controller.ts";
import { UpdateEffectController } from "./update-effect-controller.ts";
import { WindowScrollController } from "./window-scroll-controller.ts";

interface DetailDialogState {
  author: string;
  label: string;
  body: string;
  duration: string;
}

interface DialogElement extends HTMLElement {
  open: boolean;
}

/** How often the paused-room countdown redraws. */
const COUNTDOWN_INTERVAL_MS = 1000;

/** How close to the bottom, in pixels, still counts as pinned there. */
const PINNED_THRESHOLD_PX = 64;

declare global {
  interface HTMLElementTagNameMap {
    "te-room-chat-page": RoomChatPageElement;
  }
}

/**
 * Top-level page for `/:code`. Owns the chat-stream subscription
 * lifecycle (delegated to the store) and renders the timeline plus the
 * human composer. The timeline is a flat list of [`RoomEvent`] rows; all
 * kinds (bubbles, thinking, tool inline notes) render via
 * [`te-chat-message`], which switches body shape by `event.kind`.
 */
@customElement("te-room-chat-page")
export class RoomChatPageElement extends LitElement {
  @consume({ context: dashboardContext, subscribe: true })
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @property({ type: String })
  accessor code = "";

  @state()
  accessor dashboardState: DashboardState | null = null;

  @state()
  accessor sending = false;

  @state()
  accessor detailDialog: DetailDialogState | null = null;

  @state()
  accessor imageDialogSrc: string | null = null;

  /** Wall-clock tick used to redraw the paused-room countdown each second. */
  @state()
  accessor nowMillis = Date.now();

  #detailDialogRef: Ref<DialogElement> = createRef();

  #imageDialogRef: Ref<DialogElement> = createRef();

  #settingsDialogRef: Ref<HTMLElementTagNameMap["te-room-settings-dialog"]> =
    createRef();

  #reportsDialogRef: Ref<HTMLElementTagNameMap["te-room-reports-dialog"]> =
    createRef();

  #filesDialogRef: Ref<HTMLElementTagNameMap["te-room-files-dialog"]> =
    createRef();

  /** Tracks the last selected code so `selectRoom` only fires on changes. */
  #lastSelectedCode: string | null = null;

  /** The `code` the last update saw, to notice when it changes. */
  #lastRenderedCode: string | null = null;

  /**
   * Tracks whether the user is currently anchored to the bottom of the
   * scroll viewport. Auto-scroll only fires when this is true.
   */
  #pinnedToBottom = true;

  storeSubscription: StoreController = new StoreController(this).track(
    (): DashboardStore | null => this.store,
    (next: DashboardState): void => {
      this.dashboardState = next;
    },
  );

  scrollTracking: WindowScrollController = new WindowScrollController(
    this,
  ).listen((): void => {
    const scrollTop = globalThis.scrollY;
    const viewport = globalThis.innerHeight;
    const total = document.documentElement.scrollHeight;
    const distanceFromBottom = total - scrollTop - viewport;
    this.#pinnedToBottom = distanceFromBottom < PINNED_THRESHOLD_PX;
  });

  countdown: IntervalController = new IntervalController(this).schedule(
    COUNTDOWN_INTERVAL_MS,
    (): void => {
      this.nowMillis = Date.now();
    },
  );

  effects: UpdateEffectController = new UpdateEffectController(this)
    .onConnected((): void => {
      this.#pinnedToBottom = true;
    })
    .onUpdated((): void => {
      if (this.#lastRenderedCode !== this.code) {
        this.#lastRenderedCode = this.code;
        this.#pinnedToBottom = true;
      }
      this.#syncSelection();
      if (this.#pinnedToBottom) {
        scrollToBottom();
      }
    })
    .onDisconnected((): void => {
      this.#lastSelectedCode = null;
    });

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
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
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
      padding: 0.1rem 0;
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

    wa-dialog.image-dialog {
      --width: min(90vw, 64rem);
    }

    .image-dialog-img {
      display: block;
      max-width: 100%;
      max-height: 75vh;
      margin: 0 auto;
      border-radius: 0.5rem;
    }
  `;
  override render(): TemplateResult {
    const view = this.#currentView();
    if (view === null) {
      return this.#renderResolving();
    }
    const { room } = view;
    const topicLabel = room.topic.trim() === "" ? room.code : room.topic;
    const active = room.roomState === "ACTIVE";
    const scrollArea = this.#renderScrollArea(view.events);
    const pausedBanner = this.#renderPausedBanner(room);
    const errorMessage = this.dashboardState?.errorMessage ?? "";
    const errorBanner =
      errorMessage === ""
        ? nothing
        : html`
          <div class="error-banner">${errorMessage}</div>
        `;
    const dialogs = this.#renderDialogs(view);
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
            ?checked="${active}"
            @change="${this.#onToggleActivation}"
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
            <wa-dropdown-item @click="${this.#openSettings}">
              Settings
            </wa-dropdown-item>
            <wa-dropdown-item @click="${this.#openReports}">
              Reports
            </wa-dropdown-item>
            <wa-dropdown-item @click="${this.#openFiles}">Files</wa-dropdown-item>
          </wa-dropdown>
        </header>
        ${scrollArea}
        <div class="composer-wrap">
          ${pausedBanner}
          <te-chat-composer
            ?disabled="${this.sending}"
            @te-send="${this.#onSend}"
          ></te-chat-composer>
          ${errorBanner}
        </div>
      </div>
      ${dialogs}
    `;
  }

  #renderDialogs(view: RoomView): TemplateResult {
    const settingsDialogRef = ref(this.#settingsDialogRef);
    const reportsDialogRef = ref(this.#reportsDialogRef);
    const filesDialogRef = ref(this.#filesDialogRef);
    const detailDialogRef = ref(this.#detailDialogRef);
    const imageDialogRef = ref(this.#imageDialogRef);
    const detail = this.detailDialog;
    const detailLabel = detail?.label ?? "";
    const detailBody =
      detail === null
        ? nothing
        : html`
          <div class="detail-dialog-author">${detail.author}</div>
          <div class="detail-dialog-duration">Took ${detail.duration}</div>
          <div class="detail-dialog-body">${detail.body}</div>
        `;
    const image =
      this.imageDialogSrc === null
        ? nothing
        : html`
          <img class="image-dialog-img" src="${this.imageDialogSrc}" alt="" />
        `;
    return html`
      <te-room-settings-dialog
        ${settingsDialogRef}
        .store="${this.store}"
      ></te-room-settings-dialog>
      <te-room-reports-dialog
        ${reportsDialogRef}
        .reports="${view.reports}"
      ></te-room-reports-dialog>
      <te-room-files-dialog
        ${filesDialogRef}
        .store="${this.store}"
      ></te-room-files-dialog>
      <wa-dialog ${detailDialogRef} label="${detailLabel}">${detailBody}</wa-dialog>
      <wa-dialog ${imageDialogRef} label="Image" class="image-dialog">
        ${image}
      </wa-dialog>
    `;
  }

  #renderResolving(): TemplateResult {
    const dashboard = this.dashboardState;
    if (dashboard === null || dashboard.rooms.length === 0) {
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

  #renderPausedBanner(room: Room): TemplateResult {
    if (room.debateState !== "PAUSED" || room.roomState !== "ACTIVE") {
      return html``;
    }
    const nextTick = nextCronTick(
      room.resumeScheduleCron,
      new Date(this.nowMillis),
    );
    const countdownText =
      nextTick === null
        ? null
        : formatCountdown(nextTick.getTime() - this.nowMillis);
    const message =
      countdownText === null
        ? html`
          Paused - the leader will check back at the next scheduled time.
        `
        : html`
          Paused - the leader will come back after
          <span class="paused-banner-countdown">${countdownText}</span>.
        `;
    return html`
      <div class="paused-banner" role="status">
        <span>${message}</span>
      </div>
    `;
  }

  #renderScrollArea(events: RoomEvent[]): TemplateResult {
    if (events.length === 0) {
      return html`
        <div class="empty">
          No messages yet. Say hello to start the debate.
        </div>
      `;
    }
    const entries = repeat(
      events,
      (event) => entryKey(event),
      (event, index) => this.#renderEntry(event, events, index),
    );
    return html`
      <div
        class="scroll"
        @te-open-detail="${this.#onOpenDetail}"
        @te-open-image="${this.#onOpenImage}"
      >
        ${entries}
      </div>
    `;
  }

  #renderEntry(
    event: RoomEvent,
    events: RoomEvent[],
    index: number,
  ): TemplateResult {
    const previous = index > 0 ? (events[index - 1] ?? null) : null;
    const showSeparator = shouldShowTimeSeparator(
      previous?.timestamp ?? null,
      event.timestamp,
    );
    const separatorText = showSeparator
      ? formatSeparatorTimestamp(event.timestamp)
      : "";
    const separator = showSeparator
      ? html`
        <div class="time-separator">${separatorText}</div>
      `
      : nothing;
    const isActiveRow = event.completedAt === null;
    return html`
      ${separator}
      <te-chat-message
        .event="${event}"
        room-code="${this.code}"
        ?streaming="${isActiveRow}"
      ></te-chat-message>
    `;
  }

  #onOpenDetail = (customEvent: CustomEvent<RoomEvent>): void => {
    const event = customEvent.detail;
    const author = event.agent ?? "";
    const finishedAt =
      event.completedAt === null ? Date.now() : Date.parse(event.completedAt);
    const startedAt = Date.parse(event.timestamp);
    const elapsedMs =
      Number.isNaN(startedAt) || Number.isNaN(finishedAt)
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

  #onOpenImage = (customEvent: CustomEvent<string>): void => {
    const src = customEvent.detail;
    if (src === "") {
      return;
    }
    this.imageDialogSrc = src;
    const dialog = this.#imageDialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  };

  // -- Actions ------------------------------------------------------------

  #onToggleActivation = async (): Promise<void> => {
    const view = this.#currentView();
    if (view !== null) {
      await this.store.toggleRoomActivation(view.room);
    }
  };

  #openSettings = (): void => {
    const view = this.#currentView();
    if (view !== null) {
      this.#settingsDialogRef.value?.show(view.room);
    }
  };

  #openReports = (): void => {
    this.#reportsDialogRef.value?.show();
  };

  #openFiles = async (): Promise<void> => {
    const view = this.#currentView();
    const dialog = this.#filesDialogRef.value;
    if (view !== null && dialog !== undefined) {
      await dialog.show(view.room.code);
    }
  };

  #onBack = (): void => {
    navigateTo("/");
  };

  #onSend = async (event: CustomEvent<SendDetail>): Promise<void> => {
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
  };

  // -- Selection plumbing -------------------------------------------------

  #syncSelection(): void {
    if (this.#lastSelectedCode === this.code) {
      return;
    }
    // Before context arrives the store is still unset.
    const room = this.store?.findRoomByCode(this.code) ?? null;
    if (room === null) {
      return;
    }
    this.#lastSelectedCode = this.code;
    this.store.selectRoom(room.code);
  }

  #currentView(): RoomView | null {
    const dashboard = this.dashboardState;
    if (dashboard === null) {
      return null;
    }
    const room = this.store?.findRoomByCode(this.code) ?? null;
    if (room === null) {
      return null;
    }
    return dashboard.views.get(room.code) ?? null;
  }
}

function scrollToBottom(): void {
  globalThis.scrollTo({ top: document.documentElement.scrollHeight });
}

/**
 * Stable identity for the `repeat` directive. Prefer the row's database
 * id so reconnects (which replay the same row from snapshot) reuse the
 * same DOM and don't reset scroll / streaming-body state. Falls back to
 * a sequence-derived key for the rare in-memory event without an id.
 */
function entryKey(event: RoomEvent): string {
  return event.id === null ? `s-${event.sequence}` : `r-${event.id}`;
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  if (days === 0) {
    return clock;
  }
  const dayLabel = days === 1 ? "day" : "days";
  return `${days} ${dayLabel} and ${clock}`;
}
