import WaMarkdown from "@awesome.me/webawesome/dist/components/markdown/markdown.js";
import "@awesome.me/webawesome/dist/components/spinner/spinner.js";
import "@awesome.me/webawesome/dist/components/tooltip/tooltip.js";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import { formatDuration, type PersonaColor, resolveAvatarColor } from "#chat";
import type { RoomEvent } from "#types";

import "./event-hovercard.ts";
import { IntervalController } from "./interval-controller.ts";
import { UpdateEffectController } from "./update-effect-controller.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-chat-message": ChatMessageElement;
  }
  interface HTMLElementEventMap {
    "te-open-detail": CustomEvent<RoomEvent>;
    "te-open-image": CustomEvent<string>;
  }
}

const TICKER_THRESHOLD_MS = 3000;

/** How often the streaming "Took Ns" ticker redraws. */
const TICKER_INTERVAL_MS = 500;

/**
 * One row in the chat timeline. Renders any `RoomEvent` and switches body
 * shape by `event.kind`:
 *
 * - `AGENT_CHAT` / `LEADER_NOTE`: avatar + author header above a markdown
 *   bubble.
 * - `USER_CHAT`: right-aligned brand bubble, no header.
 * - `THINKING` / `INLINE_NOTE`: avatar + author + clickable breadcrumb on
 *   one line. While streaming the row also shows the live `detail` body
 *   beneath it and a "Took Ns" ticker once it has been running for 3s.
 *   Once finalised, only the breadcrumb remains and clicking it dispatches
 *   `te-open-detail` so the page can show the full body in a dialog.
 */
@customElement("te-chat-message")
export class ChatMessageElement extends LitElement {
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
  accessor nowMillis = Date.now();

  @state()
  accessor hoverAnchor: Element | null = null;

  @state()
  accessor hoverRefId: number | null = null;

  #bodyRef: Ref<HTMLElement> = createRef();

  ticker: IntervalController = new IntervalController(this).schedule(
    TICKER_INTERVAL_MS,
    (): void => {
      if (this.streaming) {
        this.nowMillis = Date.now();
      }
    },
  );

  autoScroll: UpdateEffectController = new UpdateEffectController(
    this,
  ).onUpdated((): void => {
    const body = this.#bodyRef.value;
    if (this.streaming && body !== undefined) {
      body.scrollTop = body.scrollHeight;
    }
  });

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

  override render(): TemplateResult {
    const event = this.event;
    if (event === null) {
      return html``;
    }
    const isSelf = event.kind === "USER_CHAT";
    const isInline =
      event.kind === "THINKING" ||
      event.kind === "INLINE_NOTE" ||
      event.kind === "SUMMARY";
    const streaming = this.streaming;
    const color = resolveAvatarColor(event.kind, event.agent);
    const rowClasses = ["row", isSelf ? "is-self" : ""]
      .filter(Boolean)
      .join(" ");
    const idAttr = event.id === null ? "" : String(event.id);
    const rowId = `row-${event.sequence}`;
    const content = isInline
      ? this.#renderInline(event, color, streaming)
      : this.#renderBubble(event, color, streaming, isSelf);
    const tooltip =
      event.id === null
        ? nothing
        : html`
          <wa-tooltip for="${rowId}" placement="left">#${
            event.sequence
          }</wa-tooltip>
        `;
    const hovercardActive = this.hoverRefId !== null;
    return html`
      <div id="${rowId}" class="${rowClasses}" data-event-id="${idAttr}">
        ${content}
      </div>
      ${tooltip}
      <te-event-hovercard
        .anchorEl="${this.hoverAnchor}"
        .eventId="${this.hoverRefId}"
        room-code="${this.roomCode}"
        ?active="${hovercardActive}"
      ></te-event-hovercard>
    `;
  }

  #renderHeader(
    color: PersonaColor,
    streaming: boolean,
    agent: string | null,
  ): TemplateResult {
    const style = `background: ${color.background}; color: ${color.foreground};`;
    const spinner = streaming
      ? html`
          <wa-spinner style="font-size: 1rem;"></wa-spinner>
        `
      : nothing;
    const authorName =
      agent === null
        ? nothing
        : html`
          <span class="author-name">${agent}</span>
        `;
    return html`
      <div class="avatar" style="${style}">${spinner}</div>
      ${authorName}
    `;
  }

  #renderBubble(
    event: RoomEvent,
    color: PersonaColor,
    streaming: boolean,
    isSelf: boolean,
  ): TemplateResult {
    const headerContent = this.#renderHeader(color, streaming, event.agent);
    const header = isSelf
      ? nothing
      : html`
        <div class="header">${headerContent}</div>
      `;
    const bubbleBody =
      event.content === "" && streaming
        ? html`
          <wa-spinner style="font-size: 0.85rem;"></wa-spinner>
        `
        : renderMarkdown(event.content);
    return html`
      ${header}
      <div
        class="bubble"
        @mouseover="${this.#onRefMouseOver}"
        @mouseout="${this.#onRefMouseOut}"
      >
        ${bubbleBody}
      </div>
    `;
  }

  #renderInline(
    event: RoomEvent,
    color: PersonaColor,
    streaming: boolean,
  ): TemplateResult {
    const hasBody = event.detail !== "";
    const tooltipDisabled = !streaming && !hasBody;
    const ticker = streaming ? this.#streamingTicker(event.timestamp) : null;
    const header = this.#renderHeader(color, streaming, event.agent);
    const label = parseEventRefs(event.content);
    const tickerLabel =
      ticker === null
        ? nothing
        : html`
          <span class="ticker">Took ${ticker}</span>
        `;
    const bodyRef = ref(this.#bodyRef);
    const liveBody = streaming
      ? html`
          <pre class="body" ${bodyRef}>${event.detail}</pre>
        `
      : nothing;
    return html`
      <div
        class="header"
        @mouseover="${this.#onRefMouseOver}"
        @mouseout="${this.#onRefMouseOut}"
      >
        ${header}
        <button
          type="button"
          class="breadcrumb"
          ?disabled="${tooltipDisabled}"
          title="${event.content}"
          @click="${this.#onInlineClick}"
        >
          ${label}
        </button>
        ${tickerLabel}
      </div>
      ${liveBody}
    `;
  }

  #onInlineClick = (): void => {
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
  };

  #onRefMouseOver = (mouseEvent: MouseEvent): void => {
    const target = mouseEvent.target;
    if (!(target instanceof Element)) {
      return;
    }
    const refElement = target.closest(".event-ref");
    if (!(refElement instanceof HTMLElement)) {
      return;
    }
    const id = Number(refElement.dataset["refId"]);
    if (!Number.isFinite(id)) {
      return;
    }
    this.hoverAnchor = refElement;
    this.hoverRefId = id;
  };

  #onRefMouseOut = (mouseEvent: MouseEvent): void => {
    const related = mouseEvent.relatedTarget;
    if (related instanceof Element && related.closest(".event-ref") !== null) {
      return;
    }
    this.hoverRefId = null;
    this.hoverAnchor = null;
  };

  /** Returns the `Took Ns` text or null if the row started under 3s ago. */
  #streamingTicker(startedAt: string): string | null {
    const elapsed = this.nowMillis - Date.parse(startedAt);
    if (Number.isNaN(elapsed) || elapsed < TICKER_THRESHOLD_MS) {
      return null;
    }
    return formatDuration(elapsed);
  }
}

/** Whether a one-character string is an ASCII digit. */
function isAsciiDigit(character: string): boolean {
  return character >= "0" && character <= "9";
}

/**
 * Splits `text` on `#N` patterns and returns a mix of plain strings and
 * `<span class="event-ref">` elements. No regex: walks the string once
 * looking for `#` followed by one or more ASCII digits.
 */
function parseEventRefs(text: string): TemplateResult | string {
  const parts: (TemplateResult | string)[] = [];
  let index = 0;
  let start = 0;

  while (index < text.length) {
    if (text.charAt(index) !== "#") {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < text.length && isAsciiDigit(text.charAt(end))) {
      end += 1;
    }
    if (end === index + 1) {
      index += 1;
      continue;
    }
    if (index > start) {
      parts.push(text.slice(start, index));
    }
    const id = text.slice(index + 1, end);
    parts.push(
      html`
        <span class="event-ref" data-ref-id="${id}">#${id}</span>
      `,
    );
    index = end;
    start = end;
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
 * Each `<wa-markdown>` we manage, so we attach the MutationObserver exactly
 * once per element instead of leaking a fresh one on every Lit re-render.
 */
const ENHANCED_MARKDOWN = new WeakSet<Element>();

/**
 * Stamped onto each `<img>` after we wire the lightbox click listener,
 * so MutationObserver re-runs don't pile up duplicate handlers.
 */
const LIGHTBOX_DATA_ATTR = "data-lightbox-wired";

/** Custom event a chat-message dispatches when an embedded image is clicked. */
export const OPEN_IMAGE_EVENT = "te-open-image";

function renderMarkdown(content: string): TemplateResult {
  if (content === "") {
    return html``;
  }
  const markdownRef = ref((raw): void => {
    syncMarkdownEl(raw, content);
  });
  return html`
    <div class="markdown">
      <wa-markdown ${markdownRef}></wa-markdown>
    </div>
  `;
}

function syncMarkdownEl(raw: unknown, content: string): void {
  if (!(raw instanceof WaMarkdown)) {
    return;
  }
  let script = raw.querySelector('script[type="text/markdown"]');
  if (script === null) {
    script = document.createElement("script");
    script.setAttribute("type", "text/markdown");
    raw.append(script);
  }
  if (script.textContent !== content) {
    script.textContent = content;
    raw.renderMarkdown();
  }
  attachImageEnhancements(raw);
}

/**
 * Watches `wa-markdown`'s rendered output and wires a click listener on each
 * image so the chat page can show it in a lightbox. Doing this in the
 * rendered DOM lets us delegate Markdown parsing to `wa-markdown` itself and
 * skip writing our own image-syntax matcher.
 */
function attachImageEnhancements(target: Element): void {
  if (ENHANCED_MARKDOWN.has(target)) {
    return;
  }
  ENHANCED_MARKDOWN.add(target);
  const apply = (): void => {
    processImagesIn(target);
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
}

function processImagesIn(root: ParentNode): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img[src]")) {
    wireLightbox(img);
  }
}

function wireLightbox(img: HTMLImageElement): void {
  if (img.getAttribute(LIGHTBOX_DATA_ATTR) !== null) {
    return;
  }
  img.setAttribute(LIGHTBOX_DATA_ATTR, "");
  img.addEventListener("click", () => {
    img.dispatchEvent(
      new CustomEvent<string>(OPEN_IMAGE_EVENT, {
        detail: img.currentSrc === "" ? img.src : img.currentSrc,
        bubbles: true,
        composed: true,
      }),
    );
  });
}
