import type { DashboardState, DashboardStore } from "@/app/state";
import type { CreateRoomRequest, Room } from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import "./cron-picker.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-create-room-dialog": CreateRoomDialog;
  }
}

interface CreateRoomForm {
  topic: string;
  goal: string;
  instruction: string;
  resumeScheduleCron: string;
  resumeScheduleLabel: string;
  reportScheduleCron: string;
  reportScheduleLabel: string;
}

const EMPTY_FORM: CreateRoomForm = {
  topic: "",
  goal: "",
  instruction: "",
  resumeScheduleCron: "0 * * * *",
  resumeScheduleLabel: "Every hour",
  reportScheduleCron: "0 9 * * *",
  reportScheduleLabel: "Every day at 09:00 UTC",
};

interface DialogElement extends HTMLElement {
  open: boolean;
}

interface CronChangeDetail {
  cron: string;
  label: string;
}

function readInputValue(target: EventTarget | null): string {
  if (!(target instanceof HTMLElement)) {
    return "";
  }
  if (!("value" in target)) {
    return "";
  }
  const value = (target as Record<string, unknown>)["value"];
  return typeof value === "string" ? value : "";
}

/**
 * Modal that captures a brand-new [`Room`]. Owns its own open state and
 * draft form; the parent calls `show()` to open the dialog, which reseeds
 * the form to its empty defaults so leftover values from a prior aborted
 * creation don't bleed in. Emits `te-room-created` with the new room on
 * success so the parent can navigate to `/:code`.
 */
@customElement("te-create-room-dialog")
export class CreateRoomDialog extends LitElement {
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor formState: CreateRoomForm = { ...EMPTY_FORM };

  @state()
  private accessor dashboardState: DashboardState | null = null;

  #dialogRef: Ref<DialogElement> = createRef();

  #unsubscribe: (() => void) | null = null;

  static override styles = css`
    .form-grid {
      display: grid;
      gap: 0.6rem;
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

    wa-input,
    wa-textarea,
    wa-select {
      display: block;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    .schedule-grid {
      display: grid;
      gap: 0.6rem;
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

  override connectedCallback(): void {
    super.connectedCallback();
    this.#bindStore();
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("store")) {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#bindStore();
    }
  }

  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    super.disconnectedCallback();
  }

  /** Resets the draft form and opens the dialog. */
  show(): void {
    this.formState = { ...EMPTY_FORM };
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  }

  override render() {
    const busy = this.dashboardState?.isCreatingRoom ?? false;
    const error = this.dashboardState?.errorMessage ?? null;
    const form = this.formState;
    return html`
      <wa-dialog ${ref(this.#dialogRef)} label="New room">
        ${error
          ? html`
            <div class="error-banner">${error}</div>
          `
          : nothing}
        <div class="form-grid">
          ${this.#renderTextField(
            "topic",
            "Topic",
            form.topic,
            (v) => this.#patchForm({ topic: v }),
            "Short subject the debaters argue about. Shown to every persona at the top of every turn and used as the room's display label.",
          )} ${this.#renderTextField(
            "goal",
            "Goal",
            form.goal,
            (v) => this.#patchForm({ goal: v }),
            "What you want the room to produce. Used by the leader to judge whether the discussion is on track.",
          )} ${this.#renderTextArea(
            "instruction",
            "Instruction",
            form.instruction,
            (v) => this.#patchForm({ instruction: v }),
            "Optional. Rules personas must follow plus any background context to treat as already-known facts. Appended to every persona prompt.",
          )}
          <div class="schedule-grid">
            <div class="form-field">
              ${this.#renderLabel(
                "wake-check",
                "Wake-check schedule",
                "Times are interpreted in UTC. While the room is paused, the leader checks at this cadence whether to resume the debate.",
              )}
              <te-cron-picker
                name="wake-check"
                .cron="${form.resumeScheduleCron}"
                .label="${form.resumeScheduleLabel}"
                @te-change="${(e: CustomEvent<CronChangeDetail>): void =>
                  this.#patchForm({
                    resumeScheduleCron: e.detail.cron,
                    resumeScheduleLabel: e.detail.label,
                  })}"
              ></te-cron-picker>
            </div>
            <div class="form-field">
              ${this.#renderLabel(
                "report",
                "Report schedule",
                "Times are interpreted in UTC. The leader writes a long-form report on each firing of this schedule.",
              )}
              <te-cron-picker
                name="report"
                .cron="${form.reportScheduleCron}"
                .label="${form.reportScheduleLabel}"
                @te-change="${(e: CustomEvent<CronChangeDetail>): void =>
                  this.#patchForm({
                    reportScheduleCron: e.detail.cron,
                    reportScheduleLabel: e.detail.label,
                  })}"
              ></te-cron-picker>
            </div>
          </div>
        </div>
        <div slot="footer" class="footer-row">
          <wa-button
            size="small"
            ?disabled="${busy}"
            @click="${this.#onCancel}"
          >
            Cancel
          </wa-button>
          <wa-button
            size="small"
            ?disabled="${busy}"
            @click="${this.#submit}"
          >
            Create
          </wa-button>
        </div>
      </wa-dialog>
    `;
  }

  #renderTextField(
    key: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    tooltip?: string,
  ) {
    return html`
      <label class="form-field">
        ${this.#renderLabel(key, label, tooltip)}
        <wa-input
          size="small"
          .value="${value}"
          @input="${(e: InputEvent): void =>
            onChange(readInputValue(e.target))}"
        ></wa-input>
      </label>
    `;
  }

  #renderTextArea(
    key: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    tooltip?: string,
  ) {
    return html`
      <label class="form-field">
        ${this.#renderLabel(key, label, tooltip)}
        <wa-textarea
          size="small"
          rows="3"
          .value="${value}"
          @input="${(e: InputEvent): void =>
            onChange(readInputValue(e.target))}"
        ></wa-textarea>
      </label>
    `;
  }

  #renderLabel(key: string, label: string, tooltip?: string) {
    if (tooltip === undefined || tooltip === "") {
      return html`
        <span class="form-label">${label}</span>
      `;
    }
    const anchorId = `tip-${key}`;
    return html`
      <span class="form-label">
        <span>${label}</span>
        <wa-icon
          id="${anchorId}"
          class="help-icon"
          name="circle-question"
          tabindex="0"
        ></wa-icon>
      </span>
      <wa-tooltip for="${anchorId}" placement="top">${tooltip}</wa-tooltip>
    `;
  }

  #patchForm(patch: Partial<CreateRoomForm>): void {
    this.formState = { ...this.formState, ...patch };
  }

  async #submit(): Promise<void> {
    const request: CreateRoomRequest = {
      topic: this.formState.topic,
      goal: this.formState.goal,
      instruction: this.formState.instruction === ""
        ? null
        : this.formState.instruction,
      resumeScheduleCron: this.formState.resumeScheduleCron,
      resumeScheduleLabel: this.formState.resumeScheduleLabel,
      reportScheduleCron: this.formState.reportScheduleCron,
      reportScheduleLabel: this.formState.reportScheduleLabel,
    };
    const created: Room | null = await this.store.createRoom(request);
    if (created !== null) {
      const dialog = this.#dialogRef.value;
      if (dialog !== undefined) {
        dialog.open = false;
      }
      this.dispatchEvent(
        new CustomEvent("te-room-created", {
          detail: { room: created },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  #onCancel(): void {
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = false;
    }
  }

  #bindStore(): void {
    if (this.#unsubscribe !== null || this.store === undefined) {
      return;
    }
    this.#unsubscribe = this.store.subscribe((): void => {
      this.dashboardState = this.store.getState();
    });
    this.dashboardState = this.store.getState();
  }
}
