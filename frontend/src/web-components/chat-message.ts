import {
  formatDuration,
  type PersonaColor,
  resolveAvatarColor,
} from "@/app/chat";
import type { RoomEvent } from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-chat-message": ChatMessage;
  }
}

const TICKER_THRESHOLD_MS = 3_000;

/**
 * One row in the chat timeline. Renders any `RoomEvent` and switches body
 * shape by `event.kind`:
 *
 * - `agent_chat` / `leader_note`: avatar + author header above a markdown
 *   bubble.
 * - `user_chat`: right-aligned brand bubble, no header.
 * - `thinking` / `inline_note`: avatar + author + clickable breadcrumb on
 *   one line. While streaming the row also shows the live `detail` body
 *   beneath it and a "Took Ns" ticker once it has been running for 3s.
 *   Once finalised, only the breadcrumb remains and clicking it dispatches
 *   `te-open-detail` so the page can show the full body in a dialog.
 */
@customElement("te-chat-message")
export class ChatMessage extends LitElement {
  @property({ attribute: false })
  accessor event: RoomEvent | null = null;

  /** Wall-clock tick used to redraw the streaming "Took Ns" ticker. */
  @state()
  private accessor nowMillis = Date.now();

  #tickerInterval: ReturnType<typeof setInterval> | null = null;

  static override styles = css`
    :host {
      display: block;
      --avatar-size: 2rem;
      --header-gap: 0.5rem;
      --content-indent: 2.5rem;
    }

    .row {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      align-items: flex-start;
      min-width: 0;
    }

    .row.is-self {
      align-items: flex-end;
    }

    .header {
      display: flex;
      align-items: center;
      gap: var(--header-gap);
      min-width: 0;
      max-width: 100%;
    }

    .avatar {
      width: var(--avatar-size);
      height: var(--avatar-size);
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }

    .author-name {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--wa-color-text-normal);
      flex-shrink: 0;
    }

    .bubble {
      margin-left: var(--content-indent);
      padding: 0.3rem 1.2rem;
      border-radius: 1rem;
      background: var(--wa-color-neutral-fill-quiet);
      color: var(--wa-color-text-normal);
      line-height: 1.4;
      font-size: 0.92rem;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      max-width: min(36rem, calc(100% - var(--content-indent)));
      min-width: 0;
    }

    .row.is-self .bubble {
      margin-left: var(--content-indent);
      max-width: min(36rem, calc(100% - var(--content-indent)));
      background: var(--wa-color-brand-fill-loud);
      color: var(--wa-color-brand-on-loud);
    }

    .markdown {
      min-width: 0;
      max-width: 100%;
      overflow-x: auto;
    }

    .markdown wa-markdown {
      display: block;
    }

    .breadcrumb {
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
      min-width: 0;
      max-width: 36rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .breadcrumb:hover:not(:disabled),
    .breadcrumb:focus-visible:not(:disabled) {
      background: var(--wa-color-fill-quiet);
      color: var(--wa-color-text-normal);
      outline: none;
    }

    .breadcrumb:disabled {
      cursor: default;
    }

    .ticker {
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }

    .body {
      margin-left: var(--content-indent);
      padding: 0.3rem 0.5rem;
      background: transparent;
      border-left: var(--wa-border-width-s) solid
        var(--wa-color-neutral-border-normal);
      font-family: var(--wa-font-family-code, monospace);
      font-size: 0.74rem;
      line-height: 1.45;
      color: var(--wa-color-text-quiet);
      max-width: min(36rem, calc(100% - var(--content-indent)));
      max-height: 16rem;
      overflow: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }

    .spinner {
      margin-left: var(--content-indent);
      font-size: 0.85rem;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.nowMillis = Date.now();
    this.#tickerInterval = setInterval((): void => {
      if (this.event?.completedAt === null) {
        this.nowMillis = Date.now();
      }
    }, 500);
  }

  override disconnectedCallback(): void {
    if (this.#tickerInterval !== null) {
      clearInterval(this.#tickerInterval);
      this.#tickerInterval = null;
    }
    super.disconnectedCallback();
  }

  override updated(): void {
    if (this.event?.completedAt === null) {
      const body = this.renderRoot.querySelector<HTMLElement>(".body");
      if (body !== null) {
        body.scrollTop = body.scrollHeight;
      }
    }
  }

  override render() {
    const event = this.event;
    if (event === null) {
      return nothing;
    }
    const isSelf = event.kind === "user_chat";
    const isInline = event.kind === "thinking" ||
      event.kind === "inline_note";
    const streaming = event.completedAt === null;
    const color = resolveAvatarColor(event.kind, event.agent);
    const rowClasses = ["row", isSelf ? "is-self" : ""].filter(Boolean).join(
      " ",
    );
    return html`
      <div class="${rowClasses}">
        ${isInline
          ? this.#renderInline(event, color, streaming)
          : this.#renderBubble(event, color, streaming, isSelf)}
      </div>
    `;
  }

  #renderHeader(color: PersonaColor, streaming: boolean, agent: string | null) {
    const style =
      `background: ${color.background}; color: ${color.foreground};`;
    return html`
      <div class="avatar" style="${style}">
        ${streaming
          ? html`
            <wa-spinner style="font-size: 1rem;"></wa-spinner>
          `
          : nothing}
      </div>
      ${agent !== null
        ? html`
          <span class="author-name">${agent}</span>
        `
        : nothing}
    `;
  }

  #renderBubble(
    event: RoomEvent,
    color: PersonaColor,
    streaming: boolean,
    isSelf: boolean,
  ) {
    return html`
      ${isSelf ? nothing : html`
        <div class="header">
          ${this.#renderHeader(color, streaming, event.agent)}
        </div>
      `}
      <div class="bubble">
        ${event.content === "" && streaming
          ? html`
            <wa-spinner style="font-size: 0.85rem;"></wa-spinner>
          `
          : renderMarkdown(event.content)}
      </div>
    `;
  }

  #renderInline(event: RoomEvent, color: PersonaColor, streaming: boolean) {
    const hasBody = event.detail !== "";
    const tooltipDisabled = !streaming && !hasBody;
    const ticker = streaming ? this.#streamingTicker(event.timestamp) : null;
    return html`
      <div class="header">
        ${this.#renderHeader(color, false, event.agent)}
        <button
          type="button"
          class="breadcrumb"
          ?disabled="${tooltipDisabled}"
          title="${event.content}"
          @click="${this.#onInlineClick}"
        >
          ${event.content}
        </button>
        ${ticker !== null
          ? html`
            <span class="ticker">Took ${ticker}</span>
          `
          : nothing}
      </div>
      ${streaming && hasBody
        ? html`
          <pre class="body">${event.detail}</pre>
        `
        : streaming
        ? html`
          <wa-spinner class="spinner"></wa-spinner>
        `
        : nothing}
    `;
  }

  #onInlineClick(): void {
    const event = this.event;
    if (event === null) {
      return;
    }
    if (event.completedAt === null && event.detail === "") {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<RoomEvent>("te-open-detail", {
        detail: event,
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Returns the `Took Ns` text or null if the row started under 3s ago. */
  #streamingTicker(startedAt: string): string | null {
    const elapsed = this.nowMillis - Date.parse(startedAt);
    if (Number.isNaN(elapsed) || elapsed < TICKER_THRESHOLD_MS) {
      return null;
    }
    return formatDuration(elapsed);
  }
}

function renderMarkdown(content: string) {
  if (content === "") {
    return nothing;
  }
  return html`
    <div class="markdown">
      <wa-markdown ${ref((el) => {
        if (el === undefined) {
          return;
        }
        let script = el.querySelector('script[type="text/markdown"]');
        if (script === null) {
          script = document.createElement("script");
          script.setAttribute("type", "text/markdown");
          el.appendChild(script);
        }
        if (script.textContent !== content) {
          script.textContent = content;
          (el as { renderMarkdown?: () => void }).renderMarkdown?.();
        }
      })}></wa-markdown>
    </div>
  `;
}
