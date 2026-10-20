import "@awesome.me/webawesome/dist/components/popup/popup.js";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import { EventPreviewController } from "./event-preview-controller.ts";
import { UpdateEffectController } from "./update-effect-controller.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-event-hovercard": EventHovercardElement;
  }
}

/**
 * Arrow popup that previews a room event by `#N` id.
 * The host component sets `anchorEl` and `active`; this component fetches
 * the event on demand and renders a `<wa-popup placement="top" arrow>` card.
 */
@customElement("te-event-hovercard")
export class EventHovercardElement extends LitElement {
  @property({ attribute: false })
  accessor anchorEl: Element | null = null;

  @property({ type: Number, attribute: "event-id" })
  accessor eventId: number | null = null;

  @property({ type: String, attribute: "room-code" })
  accessor roomCode = "";

  @property({ type: Boolean })
  accessor active = false;

  #preview: EventPreviewController = new EventPreviewController(this);

  /** The event id last requested, or null while the card is inactive. */
  #requested: number | null = null;

  effects: UpdateEffectController = new UpdateEffectController(this).onUpdated(
    (): void => {
      const wanted = this.active ? this.eventId : null;
      if (wanted === this.#requested) {
        return;
      }
      this.#requested = wanted;
      if (wanted !== null) {
        void this.#preview.load(this.roomCode, wanted);
      }
    },
  );

  static override styles = css`
    :host {
      display: contents;
    }

    wa-popup::part(popup) {
      background: var(--wa-color-surface-raised);
      border: 1px solid var(--wa-color-neutral-border-normal);
      border-radius: 0.5rem;
      box-shadow: var(--wa-shadow-m);
    }

    wa-popup::part(arrow) {
      background: var(--wa-color-surface-raised);
      border: 1px solid var(--wa-color-neutral-border-normal);
    }

    .card {
      padding: 0.6rem 0.75rem;
      min-width: 12rem;
      max-width: 22rem;
      font-size: 0.8rem;
      line-height: 1.4;
      pointer-events: none;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-bottom: 0.35rem;
    }

    .agent {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--wa-color-text-normal);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-body {
      color: var(--wa-color-text-normal);
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
    }

    .loading {
      color: var(--wa-color-text-quiet);
      font-style: italic;
    }
  `;

  override render(): TemplateResult {
    const anchor = this.anchorEl ?? "";
    const card = this.#preview.loading
      ? html`
          <span class="loading">Loading...</span>
        `
      : this.#renderCard();
    return html`
      <wa-popup
        .anchor="${anchor}"
        placement="top"
        arrow
        ?active="${this.active}"
        distance="8"
        strategy="fixed"
      >
        <div class="card">${card}</div>
      </wa-popup>
    `;
  }

  #renderCard(): TemplateResult {
    const previewed = this.#preview.event;
    if (previewed === null) {
      return html``;
    }
    const body = previewed.detail === "" ? previewed.content : previewed.detail;
    const header =
      previewed.agent === null
        ? nothing
        : html`
          <div class="card-header">
            <span class="agent">${previewed.agent}</span>
          </div>
        `;
    return html`
      ${header}
      <div class="card-body">${body}</div>
    `;
  }
}
