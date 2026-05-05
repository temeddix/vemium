import { type PersonaColor, resolveAvatarColor } from "@/app/chat";
import type { Draft, Message, TurnKind } from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-chat-message": ChatMessage;
  }
}

/**
 * One chat row. Renders either a finalized [`Message`] or an in-flight
 * [`Draft`] in an Instagram-style bubble: friend (AI) on the left with an
 * avatar, self (`user_chat`) on the right without one. The parent decides
 * whether the avatar slot and the agent-name label should appear (gated by
 * grouping with neighboring rows); this component owns everything inside
 * the row.
 *
 * Tool invocations are NOT rendered inline on the bubble - they are
 * persisted as separate `inline_note` rows the page renders alongside
 * bubbles. While a tool is running on an in-flight draft, the bubble
 * shows a small "running `<tool>`" indicator that disappears as soon as
 * the matching `draftToolCompleted` arrives.
 */
@customElement("te-chat-message")
export class ChatMessage extends LitElement {
  @property({ attribute: false })
  accessor message: Message | null = null;

  @property({ attribute: false })
  accessor draft: Draft | null = null;

  /**
   * Show the avatar (true) or reserve invisible space for it (false). The
   * page hides the avatar on every bubble in a same-speaker run except
   * the last so a stack of bubbles aligns under one avatar.
   */
  @property({ type: Boolean })
  accessor showAvatar = true;

  /**
   * Render the small agent-name label above the bubble. The page sets this
   * on the first bubble in a same-speaker run only.
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

    .label {
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
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

    .collapsible-block {
      margin: 0.8rem 0;
      padding: 0.3rem 0.5rem;
      background: transparent;
      border-left: var(--wa-border-width-s) solid
        var(--wa-color-neutral-border-normal);
      font-size: 0.74rem;
      color: var(--wa-color-text-quiet);
    }

    .collapsible-block > summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--wa-color-text-quiet);
      user-select: none;
    }

    .collapsible-block > summary::-webkit-details-marker {
      display: none;
    }

    .collapsible-marker {
      font-size: 0.65rem;
      transition: transform 0.15s ease;
    }

    .collapsible-block[open] > summary > .collapsible-marker {
      transform: rotate(90deg);
    }

    .reasoning-text {
      margin: 0.3rem 0 0;
      white-space: pre-wrap;
      font-family: var(--wa-font-family-code, monospace);
      font-size: 0.74rem;
      line-height: 1.45;
      max-height: 16rem;
      overflow-y: auto;
    }

    .streaming-dot {
      display: inline-block;
      width: 0.4rem;
      height: 0.4rem;
      border-radius: 50%;
      background: var(--wa-color-warning-fill-loud);
      animation: chat-pulse 1s ease-in-out infinite;
    }

    @keyframes chat-pulse {
      0%, 100% {
        opacity: 0.35;
      }
      50% {
        opacity: 1;
      }
    }

    .running-tool {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin: 0.4rem 0 0;
      font-size: 0.74rem;
      color: var(--wa-color-text-quiet);
    }

    .running-tool wa-spinner {
      font-size: 0.85rem;
    }

    .running-tool-name {
      font-family: var(--wa-font-family-code, monospace);
    }

    .error-line {
      font-size: 0.72rem;
      color: var(--wa-color-danger-on-quiet);
      margin: 0.3rem 0 0;
    }
  `;

  override render() {
    const view = this.#view();
    if (view === null) {
      return nothing;
    }
    const isSelf = view.kind === "user_chat";
    const rowClasses = ["row", isSelf ? "is-self" : ""]
      .filter(Boolean)
      .join(" ");
    const bubbleClasses = ["bubble", view.failed ? "is-failed" : ""]
      .filter(Boolean)
      .join(" ");
    return html`
      <div class="${rowClasses}">
        ${isSelf
          ? html`
            <div class="avatar is-hidden"></div>
          `
          : this.#renderAvatar(view)}
        <div class="stack">
          ${this.showLabel && view.agentName !== "" && !isSelf
            ? html`
              <span class="label">${view.agentName}</span>
            `
            : nothing}
          <div class="${bubbleClasses}">
            ${view.reasoning !== ""
              ? this.#renderReasoning(view.reasoning, view.streaming)
              : nothing} ${this.#renderContent(
                view.content,
              )} ${view.runningTool !==
                null
              ? this.#renderRunningTool(view.runningTool)
              : nothing} ${view.error !== null
              ? html`
                <p class="error-line">${view.error}</p>
              `
              : nothing}
          </div>
        </div>
      </div>
    `;
  }

  #renderAvatar(view: ChatRowView) {
    const visibility = this.showAvatar ? "" : "is-hidden";
    const style =
      `background: ${view.color.background}; color: ${view.color.foreground};`;
    return html`
      <div class="avatar ${visibility}" style="${style}">
        ${view.streaming
          ? html`
            <wa-spinner style="font-size: 1rem;"></wa-spinner>
          `
          : nothing}
      </div>
    `;
  }

  #renderContent(content: string) {
    if (content === "") {
      return nothing;
    }
    return renderMarkdown(content);
  }

  #renderCollapsible(title: string, streaming: boolean, body: unknown) {
    return html`
      <details class="collapsible-block" ?open="${streaming}">
        <summary>
          <wa-icon class="collapsible-marker" name="chevron-right"></wa-icon>
          ${title} ${streaming
            ? html`
              <span class="streaming-dot"></span>
            `
            : nothing}
        </summary>
        ${body}
      </details>
    `;
  }

  #renderReasoning(text: string, streaming: boolean) {
    return this.#renderCollapsible(
      "Thinking",
      streaming,
      html`
        <pre class="reasoning-text">${text}</pre>
      `,
    );
  }

  /**
   * Compact "running `<tool>`" indicator shown inside the bubble while a
   * tool call is in flight. Cleared by `draftToolCompleted`. The persisted
   * inline-note row for the call arrives separately and renders next to
   * the avatar in the page-level scroll list.
   */
  #renderRunningTool(tool: string) {
    return html`
      <div class="running-tool">
        <wa-spinner></wa-spinner>
        <span>running</span>
        <span class="running-tool-name">${tool}</span>
      </div>
    `;
  }

  #view(): ChatRowView | null {
    if (this.message !== null) {
      return messageView(this.message);
    }
    if (this.draft !== null) {
      return draftView(this.draft);
    }
    return null;
  }
}

interface ChatRowView {
  kind: TurnKind;
  agentName: string;
  color: PersonaColor;
  content: string;
  reasoning: string;
  runningTool: string | null;
  streaming: boolean;
  failed: boolean;
  error: string | null;
}

function messageView(message: Message): ChatRowView {
  return {
    kind: message.kind,
    agentName: message.agent ?? "",
    color: resolveAvatarColor(message.kind, message.agent),
    content: message.content,
    reasoning: message.reasoning,
    runningTool: null,
    streaming: false,
    failed: false,
    error: null,
  };
}

function draftView(draft: Draft): ChatRowView {
  return {
    kind: draft.kind,
    agentName: draft.agent,
    color: resolveAvatarColor(draft.kind, draft.agent),
    content: draft.content,
    reasoning: draft.reasoning,
    runningTool: draft.runningTool,
    streaming: draft.status === "streaming",
    failed: draft.status === "failed",
    error: draft.error,
  };
}

function renderMarkdown(content: string) {
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
