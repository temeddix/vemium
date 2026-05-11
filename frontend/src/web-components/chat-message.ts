import {
  formatDuration,
  type PersonaColor,
  resolveAvatarColor,
} from "@/app/chat";
import { BACKEND_BASE_URL } from "@/app/config";
import type { RoomEvent } from "@/app/types";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";
import "./event-hovercard.ts";

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

  /**
   * Room code used to resolve workspace-relative paths (e.g.
   * `raw/foo.png`) inside Markdown images. Without it, embedded images
   * fall back to relative URLs that won't resolve against the SPA route.
   */
  @property({ type: String, attribute: "room-code" })
  accessor roomCode = "";

  /** True while the row has not yet received a `completedAt` timestamp. */
  @property({ type: Boolean })
  accessor streaming = false;

  /** Wall-clock tick used to redraw the streaming "Took Ns" ticker. */
  @state()
  private accessor nowMillis = Date.now();

  @state()
  private accessor _hoverAnchor: Element | null = null;

  @state()
  private accessor _hoverRefId: number | null = null;

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

    .markdown wa-markdown img {
      max-width: 100%;
      height: auto;
      border-radius: 0.5rem;
      display: block;
      margin: 0.4rem 0;
      cursor: zoom-in;
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
      max-width: min(36rem, 100%);
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

    .event-ref {
      color: var(--wa-color-brand-text-loud);
      text-decoration: underline;
      text-decoration-style: dotted;
      cursor: pointer;
      border-radius: 0.2rem;
    }

    .event-ref:hover {
      background: var(--wa-color-brand-fill-quiet);
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.nowMillis = Date.now();
    this.#tickerInterval = setInterval((): void => {
      if (this.streaming) {
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
    if (this.streaming) {
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
      event.kind === "inline_note" ||
      event.kind === "summary";
    const streaming = this.streaming;
    const color = resolveAvatarColor(event.kind, event.agent);
    const rowClasses = ["row", isSelf ? "is-self" : ""].filter(Boolean).join(
      " ",
    );
    const idAttr = event.id !== null ? String(event.id) : "";
    const rowId = `row-${event.sequence}`;
    return html`
      <div id="${rowId}" class="${rowClasses}" data-event-id="${idAttr}">
        ${isInline
          ? this.#renderInline(event, color, streaming)
          : this.#renderBubble(event, color, streaming, isSelf)}
      </div>
      ${event.id !== null
        ? html`
          <wa-tooltip for="${rowId}" placement="left">#${event.id}</wa-tooltip>
        `
        : nothing}
      <te-event-hovercard
        .anchorEl="${this._hoverAnchor}"
        .eventId="${this._hoverRefId}"
        room-code="${this.roomCode}"
        ?active="${this._hoverRefId !== null}"
      ></te-event-hovercard>
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
      <div
        class="bubble"
        @mouseover="${this.#onRefMouseOver}"
        @mouseout="${this.#onRefMouseOut}"
      >
        ${event.content === "" && streaming
          ? html`
            <wa-spinner style="font-size: 0.85rem;"></wa-spinner>
          `
          : renderMarkdown(event.content, this.roomCode)}
      </div>
    `;
  }

  #renderInline(event: RoomEvent, color: PersonaColor, streaming: boolean) {
    const hasBody = event.detail !== "";
    const tooltipDisabled = !streaming && !hasBody;
    const ticker = streaming ? this.#streamingTicker(event.timestamp) : null;
    return html`
      <div
        class="header"
        @mouseover="${this.#onRefMouseOver}"
        @mouseout="${this.#onRefMouseOut}"
      >
        ${this.#renderHeader(color, streaming, event.agent)}
        <button
          type="button"
          class="breadcrumb"
          ?disabled="${tooltipDisabled}"
          title="${event.content}"
          @click="${this.#onInlineClick}"
        >
          ${parseEventRefs(event.content)}
        </button>
        ${ticker !== null
          ? html`
            <span class="ticker">Took ${ticker}</span>
          `
          : nothing}
      </div>
      ${streaming
        ? html`
          <pre class="body">${event.detail}</pre>
        `
        : nothing}
    `;
  }

  #onInlineClick(): void {
    const event = this.event;
    if (event === null) {
      return;
    }
    if (this.streaming && event.detail === "") {
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

  #onRefMouseOver(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) {
      return;
    }
    const ref = target.closest(".event-ref");
    if (!(ref instanceof HTMLElement)) {
      return;
    }
    const id = Number(ref.dataset["refId"]);
    if (!Number.isFinite(id)) {
      return;
    }
    this._hoverAnchor = ref;
    this._hoverRefId = id;
  }

  #onRefMouseOut(e: MouseEvent): void {
    const related = e.relatedTarget;
    if (related instanceof Element && related.closest(".event-ref") !== null) {
      return;
    }
    this._hoverRefId = null;
    this._hoverAnchor = null;
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

/**
 * Splits `text` on `#N` patterns and returns a mix of plain strings and
 * `<span class="event-ref">` elements. No regex: walks the string once
 * looking for `#` followed by one or more ASCII digits.
 */
function parseEventRefs(text: string): TemplateResult | string {
  const parts: Array<TemplateResult | string> = [];
  let i = 0;
  let start = 0;

  while (i < text.length) {
    if (text[i] !== "#") {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < text.length && text[j] >= "0" && text[j] <= "9") {
      j++;
    }
    if (j === i + 1) {
      i++;
      continue;
    }
    if (i > start) {
      parts.push(text.slice(start, i));
    }
    const id = text.slice(i + 1, j);
    parts.push(
      html`
        <span class="event-ref" data-ref-id="${id}">#${id}</span>
      `,
    );
    i = j;
    start = j;
  }

  if (parts.length === 0) {
    return text;
  }
  if (start < text.length) {
    parts.push(text.slice(start));
  }
  return html`
    ${parts}
  `;
}

/**
 * Stamped onto each `<wa-markdown>` we manage so we attach the
 * MutationObserver exactly once per element instead of leaking a fresh one
 * on every Lit re-render.
 */
const ENHANCEMENTS_ATTACHED = Symbol("imageEnhancementsAttached");

/**
 * Stamped onto each `<img>` after we wire the lightbox click listener,
 * so MutationObserver re-runs don't pile up duplicate handlers.
 */
const LIGHTBOX_DATA_ATTR = "data-lightbox-wired";

/** Custom event a chat-message dispatches when an embedded image is clicked. */
export const OPEN_IMAGE_EVENT = "te-open-image";

interface ManagedMarkdownEl extends HTMLElement {
  [ENHANCEMENTS_ATTACHED]?: true;
  renderMarkdown?: () => void;
}

function renderMarkdown(content: string, roomCode: string) {
  if (content === "") {
    return nothing;
  }
  const base = roomCode === ""
    ? null
    : new URL(`/${roomCode}/files/`, BACKEND_BASE_URL).href;
  return html`
    <div class="markdown">
      <wa-markdown ${ref((raw) => {
        if (raw === undefined) {
          return;
        }
        const el = raw as ManagedMarkdownEl;
        let script = el.querySelector('script[type="text/markdown"]');
        if (script === null) {
          script = document.createElement("script");
          script.setAttribute("type", "text/markdown");
          el.appendChild(script);
        }
        if (script.textContent !== content) {
          script.textContent = content;
          el.renderMarkdown?.();
        }
        attachImageEnhancements(el, base);
      })}></wa-markdown>
    </div>
  `;
}

/**
 * Watches `wa-markdown`'s rendered output and (a) rewrites
 * workspace-relative image `src` attributes (e.g. `raw/foo.png`) to the
 * live raw-file URL when a `base` is available, and (b) wires a click
 * listener on each image so the chat page can show it in a lightbox.
 * Doing this in the rendered DOM lets us delegate Markdown parsing to
 * `wa-markdown` itself and skip writing our own image-syntax matcher.
 */
function attachImageEnhancements(
  el: ManagedMarkdownEl,
  base: string | null,
): void {
  if (el[ENHANCEMENTS_ATTACHED] === true) {
    return;
  }
  el[ENHANCEMENTS_ATTACHED] = true;
  const target = el.shadowRoot ?? el;
  const apply = (): void => processImagesIn(target, base);
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
}

function processImagesIn(root: ParentNode, base: string | null): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img[src]")) {
    if (base !== null) {
      rewriteIfRelative(img, base);
    }
    wireLightbox(img);
  }
}

function rewriteIfRelative(img: HTMLImageElement, base: string): void {
  const src = img.getAttribute("src");
  if (
    src === null || src === "" ||
    src.startsWith("/") || src.startsWith("#") ||
    URL.canParse(src)
  ) {
    return;
  }
  img.setAttribute("src", new URL(src, base).href);
}

function wireLightbox(img: HTMLImageElement): void {
  if (img.getAttribute(LIGHTBOX_DATA_ATTR) !== null) {
    return;
  }
  img.setAttribute(LIGHTBOX_DATA_ATTR, "");
  img.addEventListener("click", () => {
    img.dispatchEvent(
      new CustomEvent<string>(OPEN_IMAGE_EVENT, {
        detail: img.currentSrc !== "" ? img.currentSrc : img.src,
        bubbles: true,
        composed: true,
      }),
    );
  });
}
