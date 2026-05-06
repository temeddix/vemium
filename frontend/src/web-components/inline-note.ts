import { resolveAvatarColor } from "@/app/chat";
import type { RoomEvent } from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-inline-note": InlineNote;
  }
}

const TICKER_THRESHOLD_MS = 3_000;

/**
 * One side row in the chat timeline. Renders thinking and tool inline-note
 * rows. While `status === "streaming"`, the body (`detail`) is shown
 * inline and a "Took Ns" ticker appears once the row is older than 3s.
 * Once `status` flips to `done` / `failed`, only the breadcrumb line
 * remains; clicking it dispatches `te-open-detail` so the page can show
 * the full body (and the final duration) in a dialog.
 */
@customElement("te-inline-note")
export class InlineNote extends LitElement {
  @property({ attribute: false })
  accessor event: RoomEvent | null = null;

  /** Show the avatar (true) or reserve invisible space (false). */
  @property({ type: Boolean })
  accessor showAvatar = true;

  /** Show the agent-name label. Only on the first row of a same-author run. */
  @property({ type: Boolean })
  accessor showLabel = false;

  /** Wall-clock tick used to redraw the streaming "Took Ns" ticker. */
  @state()
  private accessor nowMillis = Date.now();

  #tickerInterval: ReturnType<typeof setInterval> | null = null;

  static override styles = css`
    :host {
      display: block;
    }

    .row {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .avatar {
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .avatar.is-hidden {
      visibility: hidden;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      min-width: 0;
      flex: 1;
    }

    .author-name {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--wa-color-text-normal);
      padding: 0 0.4rem;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
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

    .breadcrumb.is-failed {
      color: var(--wa-color-danger-on-quiet);
    }

    .ticker {
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
      font-variant-numeric: tabular-nums;
    }

    .body {
      margin: 0.2rem 0 0 0.4rem;
      padding: 0.3rem 0.5rem;
      background: transparent;
      border-left: var(--wa-border-width-s) solid
        var(--wa-color-neutral-border-normal);
      font-family: var(--wa-font-family-code, monospace);
      font-size: 0.74rem;
      line-height: 1.45;
      color: var(--wa-color-text-quiet);
      max-height: 16rem;
      overflow-y: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.nowMillis = Date.now();
    this.#tickerInterval = setInterval((): void => {
      if (this.event?.status === "streaming") {
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
    if (this.event?.status === "streaming") {
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
    const streaming = event.status === "streaming";
    const failed = event.status === "failed";
    const color = resolveAvatarColor(event.kind, event.agent);
    const avatarStyle =
      `background: ${color.background}; color: ${color.foreground};`;
    const breadcrumbClasses = ["breadcrumb", failed ? "is-failed" : ""]
      .filter(Boolean)
      .join(" ");
    const hasBody = event.detail !== "";
    const tooltipDisabled = !streaming && !hasBody;
    const ticker = streaming ? this.#streamingTicker(event.timestamp) : null;
    return html`
      <div class="row">
        <div
          class="avatar ${this.showAvatar ? "" : "is-hidden"}"
          style="${avatarStyle}"
        >
        </div>
        <div class="stack">
          ${this.showLabel && event.agent !== null
            ? html`
              <span class="author-name">${event.agent}</span>
            `
            : nothing}
          <div class="header">
            <button
              type="button"
              class="${breadcrumbClasses}"
              ?disabled="${tooltipDisabled}"
              @click="${this.#onClick}"
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
              <wa-spinner style="font-size: 0.85rem; margin-left: 0.4rem;"></wa-spinner>
            `
            : nothing}
        </div>
      </div>
    `;
  }

  #onClick(): void {
    const event = this.event;
    if (event === null) {
      return;
    }
    if (event.status === "streaming" && event.detail === "") {
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

/**
 * Formats a millisecond duration as a compact `Ns` / `M:SS` string. The
 * dialog uses the same format for the final "Took N seconds" line, so
 * elapsed labels look identical pre/post finalisation.
 */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad2 = (n: number): string => n < 10 ? `0${n}` : `${n}`;
  return `${minutes}:${pad2(seconds)}`;
}
