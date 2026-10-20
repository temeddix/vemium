import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import type { DashboardState, DashboardStore } from "#state";
import type { CreateRoomRequest, Room, RoomEnvelope } from "#types";

import "./cron-picker.ts";
import type { CronChoice } from "./cron-picker.ts";
import {
  readInputValue,
  renderLabel,
  renderTextArea,
  renderTextField,
} from "./form-fields.ts";
import {
  GOAL_FIELD,
  INSTRUCTION_FIELD,
  REPORT_FIELD,
  TOPIC_FIELD,
  WAKE_CHECK_FIELD,
} from "./room-fields.ts";
import { StoreController } from "./store-controller.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-create-room-dialog": CreateRoomDialogElement;
  }
  interface HTMLElementEventMap {
    "te-room-created": CustomEvent<RoomEnvelope>;
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

/**
 * Modal that captures a brand-new [`Room`]. Owns its own open state and
 * draft form; the parent calls `show()` to open the dialog, which reseeds
 * the form to its empty defaults so leftover values from a prior aborted
 * creation don't bleed in. Emits `te-room-created` with the new room on
 * success so the parent can navigate to `/:code`.
 */
@customElement("te-create-room-dialog")
export class CreateRoomDialogElement extends LitElement {
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  accessor formState: CreateRoomForm = { ...EMPTY_FORM };

  @state()
  accessor dashboardState: DashboardState | null = null;

  #dialogRef: Ref<DialogElement> = createRef();

  storeSubscription: StoreController = new StoreController(this).track(
    (): DashboardStore | null => this.store,
    (next: DashboardState): void => {
      this.dashboardState = next;
    },
  );

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

  /** Resets the draft form and opens the dialog. */
  show(): void {
    this.formState = { ...EMPTY_FORM };
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  }

  override render(): TemplateResult {
    const busy = this.dashboardState?.isCreatingRoom ?? false;
    const error = this.dashboardState?.errorMessage ?? null;
    const dialogRef = ref(this.#dialogRef);
    const errorBanner =
      error === null || error === ""
        ? nothing
        : html`
          <div class="error-banner">${error}</div>
        `;
    const fields = this.#renderFields();
    return html`
      <wa-dialog ${dialogRef} label="New room">
        ${errorBanner}
        ${fields}
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

  #renderFields(): TemplateResult {
    const form = this.formState;
    const topic = renderTextField(TOPIC_FIELD, form.topic, this.#onTopicInput);
    const goal = renderTextField(GOAL_FIELD, form.goal, this.#onGoalInput);
    const instruction = renderTextArea(
      INSTRUCTION_FIELD,
      form.instruction,
      this.#onInstructionInput,
    );
    const wakeCheckLabel = renderLabel(WAKE_CHECK_FIELD);
    const reportLabel = renderLabel(REPORT_FIELD);
    return html`
      <div class="form-grid">
        ${topic} ${goal} ${instruction}
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

  #onTopicInput = (event: Event): void => {
    this.formState = {
      ...this.formState,
      topic: readInputValue(event.target),
    };
  };

  #onGoalInput = (event: Event): void => {
    this.formState = {
      ...this.formState,
      goal: readInputValue(event.target),
    };
  };

  #onInstructionInput = (event: Event): void => {
    this.formState = {
      ...this.formState,
      instruction: readInputValue(event.target),
    };
  };

  #onWakeCheckChange = (event: CustomEvent<CronChoice>): void => {
    this.formState = {
      ...this.formState,
      resumeScheduleCron: event.detail.cron,
      resumeScheduleLabel: event.detail.label,
    };
  };

  #onReportChange = (event: CustomEvent<CronChoice>): void => {
    this.formState = {
      ...this.formState,
      reportScheduleCron: event.detail.cron,
      reportScheduleLabel: event.detail.label,
    };
  };

  #submit = async (): Promise<void> => {
    const request: CreateRoomRequest = {
      topic: this.formState.topic,
      goal: this.formState.goal,
      instruction:
        this.formState.instruction === "" ? null : this.formState.instruction,
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
        new CustomEvent<RoomEnvelope>("te-room-created", {
          detail: { room: created },
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  #onCancel = (): void => {
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = false;
    }
  };
}
