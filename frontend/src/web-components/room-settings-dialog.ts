import type { DashboardStore } from "@/app/state";
import type { Room, UpdateRoomRequest } from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import "./cron-picker.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-settings-dialog": RoomSettingsDialog;
  }
}

interface SettingsForm {
  topic: string;
  goal: string;
  instruction: string;
  chatIntervalSeconds: number;
  steeringIntervalSeconds: number;
  reportScheduleCron: string;
  reportScheduleLabel: string;
  pythonTimeoutSeconds: number;
  autoPauseWhenConverged: boolean;
  resumeScheduleCron: string;
  resumeScheduleLabel: string;
}

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
 * Modal that edits a single room's settings. Owns its own open state
 * and draft form; the parent calls `show(room)` to open the dialog,
 * and the dialog handles its own dismissal (ESC, backdrop, close
 * button). Saves are delegated to the store; on success the dialog
 * closes itself, on failure it stays open while the global error
 * banner surfaces the message.
 */
@customElement("te-room-settings-dialog")
export class RoomSettingsDialog extends LitElement {
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor room: Room | null = null;

  @state()
  private accessor form: SettingsForm | null = null;

  #dialogRef: Ref<DialogElement> = createRef();

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

    .input-affix {
      color: var(--wa-color-text-quiet);
      font-size: 0.78rem;
      padding: 0 0.3rem;
    }

    wa-input,
    wa-textarea,
    wa-select {
      display: block;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    .number-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 0.6rem;
    }

    @media (max-width: 720px) {
      .number-row {
        grid-template-columns: 1fr;
      }
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
  `;

  /** Seed the form from the given room and open the dialog. */
  show(room: Room): void {
    this.room = room;
    this.form = formFromRoom(room);
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  }

  override render() {
    const room = this.room;
    const form = this.form;
    return html`
      <wa-dialog ${ref(this.#dialogRef)} label="Room settings">
        ${room === null || form === null
          ? nothing
          : this.#renderForm(room, form)}
        <div slot="footer" class="footer-row">
          <wa-button
            size="small"
            @click="${this.#onResetClick}"
          >
            Reset
          </wa-button>
          <wa-button
            size="small"
            @click="${this.#onSaveClick}"
          >
            Save
          </wa-button>
        </div>
      </wa-dialog>
    `;
  }

  #renderForm(_room: Room, form: SettingsForm) {
    return html`
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
        <div class="number-row">
          ${this.#renderNumberField(
            "chat-interval",
            "Chat interval",
            form.chatIntervalSeconds,
            (v) => this.#patchForm({ chatIntervalSeconds: v }),
            "Pause between consecutive debater turns, in seconds. Lower = faster cadence, higher token spend.",
            "sec",
          )} ${this.#renderNumberField(
            "steering-interval",
            "Steering interval",
            form.steeringIntervalSeconds,
            (v) => this.#patchForm({ steeringIntervalSeconds: v }),
            "How often the leader steps in to nudge the debate, in seconds. Higher = more autonomy for personas.",
            "sec",
          )} ${this.#renderNumberField(
            "python-timeout",
            "Python timeout",
            form.pythonTimeoutSeconds,
            (v) => this.#patchForm({ pythonTimeoutSeconds: v }),
            "Hard cap for a single Python script run, in seconds. Scripts that exceed this are killed.",
            "sec",
          )}
        </div>
        <div class="schedule-grid">
          ${this.#renderBooleanSelect(
            "auto-pause",
            "Auto-pause after convergence",
            form.autoPauseWhenConverged,
            (value) => this.#patchForm({ autoPauseWhenConverged: value }),
            "When every persona signals they have nothing to add, ask the leader whether to pause until the next wake check.",
          )}
          <div class="form-field">
            <span class="form-label">Wake-check schedule</span>
            <te-cron-picker
              name="wake-check"
              helperText="Times are interpreted in UTC. When auto-paused, the leader checks at this cadence whether to resume the debate."
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
            <span class="form-label">Report schedule</span>
            <te-cron-picker
              name="report"
              helperText="Times are interpreted in UTC. The leader writes a long-form report on each firing of this schedule."
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

  #renderNumberField(
    key: string,
    label: string,
    value: number,
    onChange: (value: number) => void,
    tooltip?: string,
    suffix?: string,
  ) {
    return html`
      <label class="form-field">
        ${this.#renderLabel(key, label, tooltip)}
        <wa-input
          type="number"
          size="small"
          min="1"
          without-spin-buttons
          .value="${String(value)}"
          @input="${(e: InputEvent): void => {
            const parsed = Number.parseInt(readInputValue(e.target), 10);
            if (Number.isFinite(parsed)) {
              onChange(Math.max(1, parsed));
            }
          }}"
        >
          ${suffix === undefined ? nothing : html`
            <span slot="end" class="input-affix">${suffix}</span>
          `}
        </wa-input>
      </label>
    `;
  }

  #renderBooleanSelect(
    key: string,
    label: string,
    value: boolean,
    onChange: (value: boolean) => void,
    tooltip?: string,
  ) {
    return html`
      <label class="form-field">
        ${this.#renderLabel(key, label, tooltip)}
        <wa-select
          size="small"
          .value="${value ? "enabled" : "disabled"}"
          @change="${(e: Event): void => {
            const selected = readInputValue(e.target);
            onChange(selected === "enabled");
          }}"
        >
          <wa-option value="enabled">Enabled</wa-option>
          <wa-option value="disabled">Disabled</wa-option>
        </wa-select>
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

  #patchForm(patch: Partial<SettingsForm>): void {
    if (this.form === null) {
      return;
    }
    this.form = { ...this.form, ...patch };
  }

  #onResetClick(): void {
    if (this.room !== null) {
      this.form = formFromRoom(this.room);
    }
  }

  async #onSaveClick(): Promise<void> {
    if (this.room === null || this.form === null) {
      return;
    }
    const request: UpdateRoomRequest = {
      topic: this.form.topic,
      goal: this.form.goal,
      instruction: this.form.instruction === "" ? null : this.form.instruction,
      chatIntervalSeconds: this.form.chatIntervalSeconds,
      steeringIntervalSeconds: this.form.steeringIntervalSeconds,
      reportScheduleCron: this.form.reportScheduleCron,
      reportScheduleLabel: this.form.reportScheduleLabel,
      pythonTimeoutSeconds: this.form.pythonTimeoutSeconds,
      autoPauseWhenConverged: this.form.autoPauseWhenConverged,
      resumeScheduleCron: this.form.resumeScheduleCron,
      resumeScheduleLabel: this.form.resumeScheduleLabel,
    };
    const ok = await this.store.updateRoom(this.room.code, request);
    if (ok) {
      const dialog = this.#dialogRef.value;
      if (dialog !== undefined) {
        dialog.open = false;
      }
    }
  }
}

function formFromRoom(room: Room): SettingsForm {
  return {
    topic: room.topic,
    goal: room.goal,
    instruction: room.instruction ?? "",
    chatIntervalSeconds: room.chatIntervalSeconds,
    steeringIntervalSeconds: room.steeringIntervalSeconds,
    reportScheduleCron: room.reportScheduleCron,
    reportScheduleLabel: room.reportScheduleLabel,
    pythonTimeoutSeconds: room.pythonTimeoutSeconds,
    autoPauseWhenConverged: room.autoPauseWhenConverged,
    resumeScheduleCron: room.resumeScheduleCron,
    resumeScheduleLabel: room.resumeScheduleLabel,
  };
}
