import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

/** What a `te-send` event carries: the trimmed message text. */
export interface SendDetail {
  content: string;
}

declare global {
  interface HTMLElementTagNameMap {
    "te-chat-composer": ChatComposerElement;
  }
  interface HTMLElementEventMap {
    "te-send": CustomEvent<SendDetail>;
  }
}

/**
 * Bottom-of-page text input for the human operator. Emits a `te-send`
 * `CustomEvent<{ content: string }>` when the user submits; the parent
 * page is responsible for the actual network call.
 *
 * Submission rules:
 * - Enter alone -> submit (and clear)
 * - Shift+Enter -> insert newline
 * - Empty / whitespace-only input is silently ignored
 */
@customElement("te-chat-composer")
export class ChatComposerElement extends LitElement {
  /**
   * Disables the textarea + button. Used while the parent has an in-flight
   * send so the user can't double-submit; the parent currently fires this
   * back to false on response.
   */
  @property({ type: Boolean })
  accessor disabled = false;

  @state()
  accessor draft: string = "";

  #textareaRef: Ref<HTMLTextAreaElement> = createRef();

  static override styles = css`
    :host {
      display: block;
    }

    .composer {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
      padding: 0.5rem 0;
    }

    textarea {
      flex: 1;
      resize: none;
      min-height: 2.4rem;
      max-height: 10rem;
      padding: 0.55rem 0.75rem;
      border-radius: 1.2rem;
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      background: var(--wa-color-surface-default);
      color: var(--wa-color-text-normal);
      font: inherit;
      font-size: 0.92rem;
      line-height: 1.4;
      outline: none;
      box-sizing: border-box;
    }

    textarea:focus {
      border-color: var(--wa-color-brand-border-normal);
    }

    textarea:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `;

  override render(): TemplateResult {
    const canSend = this.draft.trim() !== "" && !this.disabled;
    const sendDisabled = !canSend;
    const textareaRef = ref(this.#textareaRef);
    return html`
      <div class="composer">
        <textarea
          ${textareaRef}
          rows="1"
          placeholder="Message..."
          .value="${this.draft}"
          ?disabled="${this.disabled}"
          @input="${this.#onInput}"
          @keydown="${this.#onKeyDown}"
        ></textarea>
        <wa-button
          size="small"
          ?disabled="${sendDisabled}"
          @click="${this.#submit}"
          pill
        >
          <wa-icon name="paper-plane" label="Send"></wa-icon>
        </wa-button>
      </div>
    `;
  }

  #onInput = (event: InputEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }
    this.draft = target.value;
    this.#autoresize(target);
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") {
      return;
    }
    if (event.shiftKey || event.isComposing) {
      return;
    }
    event.preventDefault();
    this.#submit();
  };

  #submit = (): void => {
    const content = this.draft.trim();
    if (content === "" || this.disabled) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("te-send", {
        detail: { content },
        bubbles: true,
        composed: true,
      }),
    );
    this.draft = "";
    this.#syncTextareaHeight();
  };

  #autoresize(textarea: HTMLTextAreaElement): void {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  #syncTextareaHeight(): void {
    const textarea = this.#textareaRef.value;
    if (textarea !== undefined) {
      textarea.style.height = "auto";
    }
  }
}
