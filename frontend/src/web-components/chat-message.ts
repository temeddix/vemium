import { type PersonaColor, resolveAvatarColor } from "@/app/chat";
import type { RoomEvent } from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-chat-message": ChatMessage;
  }
}

/**
 * One chat-bubble row. Renders a single bubble for a `RoomEvent` of kind
 * `agent_chat` / `leader_note` / `user_chat`. Streaming bubbles get a
 * pulsing indicator on the avatar; failed bubbles get a red border.
 *
 * Side rows (thinking, tool inline notes) are NOT rendered here - they go
 * through `te-inline-note` instead. The page-level scroll list dispatches
 * by kind.
 */
@customElement("te-chat-message")
export class ChatMessage extends LitElement {
  @property({ attribute: false })
  accessor event: RoomEvent | null = null;

  /**
   * Show the avatar (true) or reserve invisible space for it (false). The
   * page hides the avatar on every bubble in a same-speaker run except
   * the last so a stack of bubbles aligns under one avatar.
   */
  @property({ type: Boolean })
  accessor showAvatar = true;

  /**
   * Render the small agent-name label above the bubble. The page sets
   * this on the first bubble in a same-speaker run only.
   */
  @property({ type: Boolean })
  accessor showLabel = false;

  static override styles = css`
    :host {
      display: block;
    }

    .row {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
    }

    .row.is-self {
      justify-content: flex-end;
    }

    .avatar {
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

    .avatar.is-hidden {
      visibility: hidden;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      max-width: 36rem;
      min-width: 0;
    }

    .row.is-self .stack {
      align-items: flex-end;
    }

    .author-name {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--wa-color-text-normal);
      padding: 0 0.4rem;
    }

    .bubble {
      padding: 0.3rem 1.2rem;
      border-radius: 1rem;
      background: var(--wa-color-neutral-fill-quiet);
      color: var(--wa-color-text-normal);
      border: var(--wa-border-width-s) solid transparent;
      line-height: 1.4;
      font-size: 0.92rem;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }

    .row.is-self .bubble {
      background: var(--wa-color-brand-fill-loud);
      color: var(--wa-color-brand-on-loud);
    }

    .bubble.is-failed {
      border-color: var(--wa-color-danger-border-normal);
      background: var(--wa-color-danger-fill-quiet);
      color: var(--wa-color-danger-on-quiet);
    }

    .markdown {
      min-width: 0;
      max-width: 100%;
      overflow-x: auto;
    }

    .markdown wa-markdown {
      display: block;
    }
  `;

  override render() {
    const event = this.event;
    if (event === null) {
      return nothing;
    }
    const isSelf = event.kind === "user_chat";
    const failed = event.status === "failed";
    const streaming = event.status === "streaming";
    const color = resolveAvatarColor(event.kind, event.agent);
    const rowClasses = ["row", isSelf ? "is-self" : ""].filter(Boolean).join(
      " ",
    );
    const bubbleClasses = ["bubble", failed ? "is-failed" : ""]
      .filter(Boolean)
      .join(" ");
    return html`
      <div class="${rowClasses}">
        ${isSelf
          ? html`
            <div class="avatar is-hidden"></div>
          `
          : this.#renderAvatar(color, streaming)}
        <div class="stack">
          ${this.showLabel && event.agent !== null && !isSelf
            ? html`
              <span class="author-name">${event.agent}</span>
            `
            : nothing}
          <div class="${bubbleClasses}">
            ${event.content === "" && streaming
              ? html`
                <wa-spinner style="font-size: 0.85rem;"></wa-spinner>
              `
              : renderMarkdown(event.content)}
          </div>
        </div>
      </div>
    `;
  }

  #renderAvatar(color: PersonaColor, streaming: boolean) {
    const visibility = this.showAvatar ? "" : "is-hidden";
    const style =
      `background: ${color.background}; color: ${color.foreground};`;
    return html`
      <div class="avatar ${visibility}" style="${style}">
        ${streaming
          ? html`
            <wa-spinner style="font-size: 1rem;"></wa-spinner>
          `
          : nothing}
      </div>
    `;
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
