import {
  avatarInitials,
  type PersonaColor,
  resolveAvatarColor,
} from "@/app/chat";
import type {
  Draft,
  DraftToolCall,
  Message,
  ToolCallRecord,
  TurnKind,
} from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-chat-message": ChatMessage;
  }
}

interface ToolCallView {
  tool: string;
  status: "running" | "ok" | "error";
  argsPreview: string;
  outputPreview: string | null;
  durationMs: number | null;
}

/**
 * One chat row. Renders either a finalized [`Message`] or an in-flight
 * [`Draft`] in an Instagram-style bubble: friend (AI) on the left with an
 * avatar, self (`user_chat`) on the right without one. The parent decides
 * whether the avatar slot and the agent-name label should appear (gated by
 * grouping with neighboring rows); this component owns everything inside
 * the row.
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
      flex-direction: row-reverse;
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

    .tool-list {
      display: grid;
      gap: 0.3rem;
      margin: 0.3rem 0 0;
      padding: 0;
      list-style: none;
    }

    .tool-list > li {
      display: grid;
      gap: 0.2rem;
    }

    .tool-meta {
      display: flex;
      gap: 0.4rem;
      align-items: center;
      font-size: 0.7rem;
      color: var(--wa-color-text-quiet);
    }

    .tool-args {
      font-family: var(--wa-font-family-code, monospace);
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
    }

    .tool-output {
      font-family: var(--wa-font-family-code, monospace);
      font-size: 0.74rem;
      white-space: pre-wrap;
      margin: 0;
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
              : nothing} ${this.#renderContent(view.content)} ${view.toolCalls
                .length > 0
              ? this.#renderToolCalls(view.toolCalls)
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
          : view.initials}
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

  #renderToolCalls(calls: ToolCallView[]) {
    const anyRunning = calls.some((c) => c.status === "running");
    const title = `${calls.length} ${
      calls.length === 1 ? "TOOL" : "TOOLS"
    } USED`;
    const body = html`
      <ul class="tool-list">
        ${calls.map((call) =>
          html`
            <li>
              <div class="tool-meta">
                <strong>${call.tool}</strong>
                ${this.#renderToolStatus(call.status)} ${call.durationMs !==
                    null
                  ? html`
                    <span>${call.durationMs} ms</span>
                  `
                  : nothing}
              </div>
              ${call.argsPreview !== ""
                ? html`
                  <pre class="tool-args">${call.argsPreview}</pre>
                `
                : nothing} ${call.outputPreview !== null
                ? html`
                  <pre class="tool-output">${call.outputPreview}</pre>
                `
                : nothing}
            </li>
          `
        )}
      </ul>
    `;
    return this.#renderCollapsible(title, anyRunning, body);
  }

  #renderToolStatus(status: ToolCallView["status"]) {
    if (status === "running") {
      return html`
        <wa-badge size="small">running</wa-badge>
      `;
    }
    if (status === "ok") {
      return html`
        <wa-badge size="small">ok</wa-badge>
      `;
    }
    return html`
      <wa-badge size="small">error</wa-badge>
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
  initials: string;
  color: PersonaColor;
  content: string;
  reasoning: string;
  toolCalls: ToolCallView[];
  streaming: boolean;
  failed: boolean;
  error: string | null;
}

function messageView(message: Message): ChatRowView {
  return {
    kind: message.kind,
    agentName: message.agent ?? "",
    initials: avatarInitials(message.kind, message.agent),
    color: resolveAvatarColor(message.kind, message.agent),
    content: message.content,
    reasoning: message.reasoning,
    toolCalls: message.toolCalls.map(toolRecordToView),
    streaming: false,
    failed: false,
    error: null,
  };
}

function draftView(draft: Draft): ChatRowView {
  return {
    kind: draft.kind,
    agentName: draft.agent,
    initials: avatarInitials(draft.kind, draft.agent),
    color: resolveAvatarColor(draft.kind, draft.agent),
    content: draft.content,
    reasoning: draft.reasoning,
    toolCalls: draft.toolCalls.map(draftCallToView),
    streaming: draft.status === "streaming",
    failed: draft.status === "failed",
    error: draft.error,
  };
}

function toolRecordToView(record: ToolCallRecord): ToolCallView {
  return {
    tool: record.tool,
    status: record.ok ? "ok" : "error",
    argsPreview: previewArgsValue(record.args),
    outputPreview: record.outputPreview,
    durationMs: record.durationMs,
  };
}

function draftCallToView(call: DraftToolCall): ToolCallView {
  return {
    tool: call.tool,
    status: call.status,
    argsPreview: call.argsPreview,
    outputPreview: call.outputPreview,
    durationMs: call.durationMs,
  };
}

function previewArgsValue(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) {
      return "";
    }
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  } catch {
    return "";
  }
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
