import type { DashboardStore } from "@/app/state";
import type { Room } from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-clone-room-dialog": CloneRoomDialog;
  }
}

interface DialogElement extends HTMLElement {
  open: boolean;
}

/**
 * Modal that confirms a room clone. Owns its own open state; the parent
 * calls `show(room)` to open the dialog. On success, emits `te-cloned` with
 * the newly created room so the parent can navigate to it. The clone always
 * starts with an empty chat log because the workspace folder (`raw/`,
 * `src/`, etc.) is not duplicated and any messages referencing those files
 * would be left dangling.
 */
@customElement("te-clone-room-dialog")
export class CloneRoomDialog extends LitElement {
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor room: Room | null = null;

  @state()
  private accessor busy = false;

  @state()
  private accessor errorText: string | null = null;

  #dialogRef: Ref<DialogElement> = createRef();

  static override styles = css`
    .form-grid {
      display: grid;
      gap: 0.6rem;
    }

    .summary {
      font-size: 0.85rem;
      color: var(--wa-color-text-quiet);
      line-height: 1.4;
    }

    .summary-topic {
      color: var(--wa-color-text-normal);
      font-weight: 600;
    }

    .form-field {
      display: grid;
      gap: 0.25rem;
    }

    .form-label {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--wa-color-text-quiet);
    }

    .help-icon {
      color: var(--wa-color-text-quiet);
      cursor: help;
      font-size: 0.85rem;
    }

    wa-select {
      display: block;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    .footer-row {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .error-banner {
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      background: var(--wa-color-danger-fill-quiet);
      color: var(--wa-color-danger-on-quiet);
      font-size: 0.85rem;
      margin-bottom: 0.6rem;
    }
  `;

  /** Seeds the form for the given room and opens the dialog. */
  show(room: Room): void {
    this.room = room;
    this.errorText = null;
    this.busy = false;
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  }

  override render() {
    const room = this.room;
    return html`
      <wa-dialog ${ref(this.#dialogRef)} label="Duplicate room">
        ${this.errorText !== null
          ? html`
            <div class="error-banner">${this.errorText}</div>
          `
          : nothing} ${room === null ? nothing : this.#renderForm(room)}
        <div slot="footer" class="footer-row">
          <wa-button
            size="small"
            ?disabled="${this.busy}"
            @click="${this.#onCancel}"
          >
            Cancel
          </wa-button>
          <wa-button
            size="small"
            ?disabled="${this.busy}"
            @click="${this.#onConfirm}"
          >
            Duplicate
          </wa-button>
        </div>
      </wa-dialog>
    `;
  }

  #renderForm(room: Room) {
    const sourceLabel = room.topic.trim() === "" ? room.code : room.topic;
    return html`
      <div class="form-grid">
        <p class="summary">
          Create a new room with the same settings as
          <span class="summary-topic">${sourceLabel}</span>. The duplicate starts
          deactivated with a freshly generated code and an empty chat log; reports and
          workspace files are not carried over.
        </p>
      </div>
    `;
  }

  async #onConfirm(): Promise<void> {
    const room = this.room;
    if (room === null || this.busy) {
      return;
    }
    this.busy = true;
    this.errorText = null;
    const cloned = await this.store.cloneRoom(room.code);
    this.busy = false;
    if (cloned === null) {
      this.errorText = "Duplicate failed. See the error banner for details.";
      return;
    }
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = false;
    }
    this.dispatchEvent(
      new CustomEvent("te-cloned", {
        detail: { room: cloned },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #onCancel(): void {
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = false;
    }
  }
}
