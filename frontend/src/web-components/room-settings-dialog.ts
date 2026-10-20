import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import type { DashboardStore } from "#state";
import type { Room, UpdateRoomRequest } from "#types";

import "./cron-picker.ts";
import type { CronChoice } from "./cron-picker.ts";
import {
  readInputValue,
  readPositiveInteger,
  renderLabel,
  renderNumberField,
  renderTextArea,
  renderTextField,
} from "./form-fields.ts";
import {
  CHAT_INTERVAL_FIELD,
  GOAL_FIELD,
  INSTRUCTION_FIELD,
  PYTHON_TIMEOUT_FIELD,
  REPORT_FIELD,
  STEERING_INTERVAL_FIELD,
  TOPIC_FIELD,
  WAKE_CHECK_FIELD,
} from "./room-fields.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-settings-dialog": RoomSettingsDialogElement;
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
  resumeScheduleCron: string;
  resumeScheduleLabel: string;
}

interface DialogElement extends HTMLElement {
  open: boolean;
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
export class RoomSettingsDialogElement extends LitElement {
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  accessor room: Room | null = null;

  @state()
  accessor form: SettingsForm | null = null;

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

  override render(): TemplateResult {
    const room = this.room;
    const form = this.form;
    const dialogRef = ref(this.#dialogRef);
    const fields =
      room === null || form === null ? nothing : this.#renderForm(form);
    return html`
      <wa-dialog ${dialogRef} label="Room settings">
        ${fields}
        <div slot="footer" class="footer-row">
          <wa-button size="small" @click="${this.#onResetClick}">Reset</wa-button>
          <wa-button size="small" @click="${this.#onSaveClick}">Save</wa-button>
        </div>
      </wa-dialog>
    `;
  }

  #renderForm(form: SettingsForm): TemplateResult {
    const topic = renderTextField(TOPIC_FIELD, form.topic, this.#onTopicInput);
    const goal = renderTextField(GOAL_FIELD, form.goal, this.#onGoalInput);
    const instruction = renderTextArea(
      INSTRUCTION_FIELD,
      form.instruction,
      this.#onInstructionInput,
    );
    const numbers = this.#renderNumberRow(form);
    const wakeCheckLabel = renderLabel(WAKE_CHECK_FIELD);
    const reportLabel = renderLabel(REPORT_FIELD);
    return html`
      <div class="form-grid">
        ${topic} ${goal} ${instruction} ${numbers}
        <div class="schedule-grid">
          <div class="form-field">
            ${wakeCheckLabel}
            <te-cron-picker
              name="wake-check"
              .cron="${form.resumeScheduleCron}"
              .label="${form.resumeScheduleLabel}"
              @te-change="${this.#onWakeCheckChange}"
            ></te-cron-picker>
          </div>
          <div class="form-field">
            ${reportLabel}
            <te-cron-picker
              name="report"
              .cron="${form.reportScheduleCron}"
              .label="${form.reportScheduleLabel}"
              @te-change="${this.#onReportChange}"
            ></te-cron-picker>
          </div>
        </div>
      </div>
    `;
  }

  #renderNumberRow(form: SettingsForm): TemplateResult {
    const chatInterval = renderNumberField(
      CHAT_INTERVAL_FIELD,
      form.chatIntervalSeconds,
      "sec",
      this.#onChatIntervalInput,
    );
    const steeringInterval = renderNumberField(
      STEERING_INTERVAL_FIELD,
      form.steeringIntervalSeconds,
      "sec",
      this.#onSteeringIntervalInput,
    );
    const pythonTimeout = renderNumberField(
      PYTHON_TIMEOUT_FIELD,
      form.pythonTimeoutSeconds,
      "sec",
      this.#onPythonTimeoutInput,
    );
    return html`
      <div class="number-row">
        ${chatInterval} ${steeringInterval} ${pythonTimeout}
      </div>
    `;
  }

  #patchForm(next: SettingsForm | null): void {
    if (this.form !== null && next !== null) {
      this.form = next;
    }
  }

  #onTopicInput = (event: Event): void => {
    const topic = readInputValue(event.target);
    this.#patchForm(this.form && { ...this.form, topic });
  };

  #onGoalInput = (event: Event): void => {
    const goal = readInputValue(event.target);
    this.#patchForm(this.form && { ...this.form, goal });
  };

  #onInstructionInput = (event: Event): void => {
    const instruction = readInputValue(event.target);
    this.#patchForm(this.form && { ...this.form, instruction });
  };

  #onChatIntervalInput = (event: Event): void => {
    const chatIntervalSeconds = readPositiveInteger(event.target);
    if (chatIntervalSeconds !== null) {
      this.#patchForm(this.form && { ...this.form, chatIntervalSeconds });
    }
  };

  #onSteeringIntervalInput = (event: Event): void => {
    const steeringIntervalSeconds = readPositiveInteger(event.target);
    if (steeringIntervalSeconds !== null) {
      this.#patchForm(this.form && { ...this.form, steeringIntervalSeconds });
    }
  };

  #onPythonTimeoutInput = (event: Event): void => {
    const pythonTimeoutSeconds = readPositiveInteger(event.target);
    if (pythonTimeoutSeconds !== null) {
      this.#patchForm(this.form && { ...this.form, pythonTimeoutSeconds });
    }
  };

  #onWakeCheckChange = (event: CustomEvent<CronChoice>): void => {
    this.#patchForm(
      this.form && {
        ...this.form,
        resumeScheduleCron: event.detail.cron,
        resumeScheduleLabel: event.detail.label,
      },
    );
  };

  #onReportChange = (event: CustomEvent<CronChoice>): void => {
    this.#patchForm(
      this.form && {
        ...this.form,
        reportScheduleCron: event.detail.cron,
        reportScheduleLabel: event.detail.label,
      },
    );
  };

  #onResetClick = (): void => {
    if (this.room !== null) {
      this.form = formFromRoom(this.room);
    }
  };

  #onSaveClick = async (): Promise<void> => {
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
  };
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
    resumeScheduleCron: room.resumeScheduleCron,
    resumeScheduleLabel: room.resumeScheduleLabel,
  };
}
