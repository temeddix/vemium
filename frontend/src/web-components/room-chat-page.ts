import {
  avatarInitials,
  formatSeparatorTimestamp,
  isLastInRun,
  resolveAvatarColor,
  shouldShowTimeSeparator,
} from "@/app/chat";
import { dashboardContext } from "@/app/context";
import type { DashboardState, DashboardStore } from "@/app/state";
import type { Draft, Message, Room, RoomView } from "@/app/types";
import { roomStatusToText } from "@/app/utils";
import { consume } from "@lit/context";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import "./chat-composer.ts";
import "./chat-message.ts";
import "./room-files-dialog.ts";
import "./room-reports-dialog.ts";
import "./room-settings-dialog.ts";

interface InlineNoteEntry {
  author: string;
  text: string;
  detail: string;
  timestamp: string;
}

interface NoteDialogState {
  author: string;
  text: string;
  detail: string;
}

declare global {
  interface HTMLElementTagNameMap {
    "te-room-chat-page": RoomChatPage;
  }
}

interface BubbleEntry {
  type: "message" | "draft" | "inline-note";
  message: Message | null;
  draft: Draft | null;
  inlineNote: InlineNoteEntry | null;
  /** Sort key shared between persisted messages and live drafts. */
  sortKey: number;
  /** ISO timestamp used for time-gap separators and grouping decisions. */
  timestamp: string;
  /** Speaker identity for grouping (matches `Message.agent`/`Draft.agent`). */
  agentKey: string;
  kind: BubbleKind;
}

type BubbleKind = "agent_chat" | "leader_note" | "user_chat";

/**
 * Top-level page for `/room/:code`. Owns the chat-stream subscription
 * lifecycle (delegated to the store) and renders the bubble feed plus
 * the human composer. Header actions open Settings / Reports modals
 * rather than inline tabs so the chat itself stays the focal point.
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
  private accessor noteDialog: NoteDialogState | null = null;

  #noteDialogRef: Ref<HTMLElement & { open: boolean }> = createRef();

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
   * scroll viewport. Auto-scroll to the new bottom only fires when this
   * is true so a user reading older messages isn't yanked away.
   */
  #pinnedToBottom = true;

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--wa-color-surface-default);
      box-sizing: border-box;
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
      padding: 0.8rem 0;
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

    .room-code {
      font-size: 0.78rem;
      color: var(--wa-color-text-quiet);
      font-family: var(--wa-font-family-code, ui-monospace, monospace);
    }

    .badges {
      display: flex;
      gap: 0.4rem;
      align-items: center;
      flex-shrink: 0;
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

    .inline-note-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .inline-note-avatar {
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }

    .inline-note-avatar.is-hidden {
      visibility: hidden;
    }

    .inline-note-button {
      background: none;
      border: none;
      padding: 0.1rem 0.4rem;
      margin: 0;
      font: inherit;
      font-size: 0.78rem;
      color: var(--wa-color-text-quiet);
      cursor: pointer;
      text-align: left;
      border-radius: 0.4rem;
    }

    .inline-note-button:hover,
    .inline-note-button:focus-visible {
      background: var(--wa-color-fill-quiet);
      color: var(--wa-color-text-normal);
      outline: none;
    }

    .inline-note-author {
      font-weight: 600;
    }

    .detail-dialog-author {
      font-size: 0.78rem;
      color: var(--wa-color-text-quiet);
      margin-bottom: 0.4rem;
    }

    .detail-dialog-body {
      font-size: 0.95rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      font-family: var(--wa-font-family-code, ui-monospace, monospace);
    }

    .empty {
      flex: 1;
      display: grid;
      place-items: center;
      color: var(--wa-color-text-quiet);
      font-size: 0.9rem;
    }

    .composer-wrap {
      padding: 0.4rem 0 0.8rem;
      position: sticky;
      bottom: 0;
      background: var(--wa-color-surface-default);
      z-index: 2;
    }

    .error-banner {
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      background: var(--wa-color-danger-fill-quiet);
      color: var(--wa-color-danger-on-quiet);
      font-size: 0.85rem;
      margin-top: 0.4rem;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#bindStore();
    globalThis.addEventListener("scroll", this.#onWindowScroll, {
      passive: true,
    });
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
    super.disconnectedCallback();
  }

  override render() {
    const view = this.#currentView();
    if (view === null) {
      return this.#renderResolving();
    }
    const { room } = view;
    const entries = this.#bubbleEntries(view);
    const topicLabel = room.topic.trim() === "" ? room.code : room.topic;
    return html`
      <div class="container">
        <header class="header">
          <button class="back-button" @click="${this.#onBack}" title="Back">
            <wa-icon name="chevron-left"></wa-icon>
          </button>
          <div class="title">
            <div class="room-topic">${topicLabel}</div>
            <div class="room-code">${room.code}</div>
          </div>
          <div class="badges">
            <wa-badge size="small" appearance="outlined">
              ${this.dashboardState?.wsConnected
                ? "Connected"
                : `Reconnecting #${this.dashboardState?.reconnectAttempt ?? 0}`}
            </wa-badge>
            <wa-badge size="small" appearance="outlined">
              ${roomStatusToText(room.status)}
            </wa-badge>
          </div>
          <wa-dropdown placement="bottom-end">
            <wa-button slot="trigger" size="small" title="More actions">
              <wa-icon name="ellipsis-vertical"></wa-icon>
            </wa-button>
            ${this.#renderPauseItem(room)}
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
        ${this.#renderScrollArea(entries)}
        <div class="composer-wrap">
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
        ${ref(this.#noteDialogRef)}
        label="${this.noteDialog === null ? "" : this.noteDialog.text}"
      >
        ${this.noteDialog === null ? nothing : html`
          <div class="detail-dialog-author">${this.noteDialog.author}</div>
          <div class="detail-dialog-body">${this.noteDialog.detail}</div>
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

  #renderPauseItem(room: Room) {
    if (room.status === "paused") {
      return html`
        <wa-dropdown-item
          @click="${(): Promise<void> => this.store.resumeRoom(room.code)}"
        >
          Resume
        </wa-dropdown-item>
      `;
    }
    return html`
      <wa-dropdown-item
        @click="${(): Promise<void> => this.store.pauseRoom(room.code)}"
      >
        Pause
      </wa-dropdown-item>
    `;
  }

  #renderScrollArea(entries: BubbleEntry[]) {
    if (entries.length === 0) {
      return html`
        <div class="empty">
          No messages yet. Say hello to start the debate.
        </div>
      `;
    }
    return html`
      <div class="scroll">
        ${entries.map((entry, idx) => this.#renderEntry(entry, entries, idx))}
      </div>
    `;
  }

  #renderEntry(entry: BubbleEntry, entries: BubbleEntry[], idx: number) {
    const previous = idx > 0 ? entries[idx - 1] : null;
    const next = idx < entries.length - 1 ? entries[idx + 1] : null;
    const showSeparator = shouldShowTimeSeparator(
      previous?.timestamp ?? null,
      entry.timestamp,
    );
    if (entry.type === "inline-note" && entry.inlineNote !== null) {
      return this.#renderInlineNote(
        entry.inlineNote,
        showSeparator,
        entry.timestamp,
        next,
        entry.agentKey,
        entry.kind,
      );
    }
    const isLast = isLastInRun(
      { kind: entry.kind, agent: entry.agentKey },
      next === null ? null : { kind: next.kind, agent: next.agentKey },
    );
    const isFirstInRun = previous === null ||
      previous.agentKey !== entry.agentKey ||
      previous.kind !== entry.kind ||
      showSeparator;
    return html`
      ${showSeparator
        ? html`
          <div class="time-separator">
            ${formatSeparatorTimestamp(entry.timestamp)}
          </div>
        `
        : nothing}
      <te-chat-message
        .message="${entry.message}"
        .draft="${entry.draft}"
        ?showAvatar="${isLast}"
        ?showLabel="${isFirstInRun && entry.kind !== "user_chat"}"
      ></te-chat-message>
    `;
  }

  /** Renders an inline-note breadcrumb (e.g. `do_nothing`, Python run
   * outcome). The avatar matches the chat-bubble row layout so the note
   * visually attaches to the author's identity, and the dim text is a
   * button that opens a dialog with the full detail. */
  #renderInlineNote(
    note: InlineNoteEntry,
    showSeparator: boolean,
    timestamp: string,
    next: BubbleEntry | null,
    agentKey: string,
    kind: BubbleKind,
  ) {
    const showAvatar = isLastInRun(
      { kind, agent: agentKey },
      next === null ? null : { kind: next.kind, agent: next.agentKey },
    );
    const color = resolveAvatarColor(kind, note.author);
    const initials = avatarInitials(kind, note.author);
    const avatarStyle =
      `background:${color.background};color:${color.foreground}`;
    return html`
      ${showSeparator
        ? html`
          <div class="time-separator">
            ${formatSeparatorTimestamp(timestamp)}
          </div>
        `
        : nothing}
      <div class="inline-note-row">
        <div
          class="inline-note-avatar ${showAvatar ? "" : "is-hidden"}"
          style="${avatarStyle}"
        >
          ${initials}
        </div>
        <button
          type="button"
          class="inline-note-button"
          @click="${(): void => this.#openNoteDialog(note)}"
        >
          <span class="inline-note-author">${note.author}</span>
          <span> ${note.text}</span>
        </button>
      </div>
    `;
  }

  #openNoteDialog(note: InlineNoteEntry): void {
    this.noteDialog = {
      author: note.author,
      text: note.text,
      detail: note.detail,
    };
    const dialog = this.#noteDialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  }

  #bubbleEntries(view: RoomView): BubbleEntry[] {
    const messages: BubbleEntry[] = view.messages.map((message) => ({
      type: "message",
      message,
      draft: null,
      inlineNote: null,
      sortKey: message.sequence,
      timestamp: message.timestamp,
      agentKey: message.agent ?? "",
      kind: message.kind,
    }));
    const notes: BubbleEntry[] = view.inlineNotes.map((note, idx) => ({
      type: "inline-note",
      message: null,
      draft: null,
      inlineNote: {
        author: note.author,
        text: note.text,
        detail: note.detail,
        timestamp: note.timestamp,
      },
      sortKey: Number.MAX_SAFE_INTEGER - 1 + idx,
      timestamp: note.timestamp,
      agentKey: note.author,
      kind: "leader_note",
    }));
    const drafts: BubbleEntry[] = view.drafts.map((draft) => ({
      type: "draft",
      message: null,
      draft,
      inlineNote: null,
      // Drafts always sort after every persisted message (sequences live in
      // the same monotonic counter, so any unfinished draft is "newer than
      // anything we've seen").
      sortKey: Number.MAX_SAFE_INTEGER,
      timestamp: new Date().toISOString(),
      agentKey: draft.agent,
      kind: draft.kind,
    }));
    return [...messages, ...notes, ...drafts].sort((a, b) =>
      a.sortKey - b.sortKey
    );
  }

  // -- Actions ------------------------------------------------------------

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
      // Pin to bottom whenever the user themselves sends.
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
      // Rooms list may not have loaded yet; we'll try again on the next
      // store update via `updated()`.
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
