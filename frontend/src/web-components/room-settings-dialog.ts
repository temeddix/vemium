import type { DashboardStore } from "@/app/state";
import type {
  ApiType,
  ProviderConfig,
  Room,
  UpdateRoomRequest,
} from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-settings-dialog": RoomSettingsDialog;
  }
}

interface SettingsForm {
  topic: string;
  goal: string;
  instruction: string;
  background: string;
  chatIntervalSeconds: number;
  steeringIntervalSeconds: number;
  reportIntervalSeconds: number;
  pythonTimeoutSeconds: number;
  pythonFeedbackEvery: number;
  autoPauseWhenConverged: boolean;
  resumeScheduleCron: string;
  resumeScheduleLabel: string;
  low: ProviderConfig;
  high: ProviderConfig;
}

interface DialogElement extends HTMLElement {
  open: boolean;
}

interface ResumeScheduleOption {
  label: string;
  cron: string;
}

const RESUME_SCHEDULE_OPTIONS: ResumeScheduleOption[] = [
  { label: "Every 15 minutes", cron: "*/15 * * * *" },
  { label: "Every 30 minutes", cron: "*/30 * * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 3 hours", cron: "0 */3 * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily at 09:00 UTC", cron: "0 9 * * *" },
  { label: "Daily at 18:00 UTC", cron: "0 18 * * *" },
];

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
 * button). Saves are delegated to the store; the dialog stays open on
 * save so the user can see error messages.
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
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
    }

    .number-row > :nth-child(odd):last-child {
      grid-column: 1 / -1;
    }

    .provider-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
    }

    .schedule-grid {
      display: grid;
      gap: 0.6rem;
    }

    fieldset.tier {
      border: 0;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.4rem;
    }

    fieldset.tier legend {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0;
      margin-bottom: 0.2rem;
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
          "Short subject the debaters argue about. Shown to every persona at the top of every turn.",
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
          "Optional. Rules personas must follow (e.g. tone, scope). Appended to every persona prompt.",
        )} ${this.#renderTextArea(
          "background",
          "Background",
          form.background,
          (v) => this.#patchForm({ background: v }),
          "Optional. Context personas should treat as already-known facts. Useful for proprietary data the model cannot search.",
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
            "report-interval",
            "Report interval",
            form.reportIntervalSeconds,
            (v) => this.#patchForm({ reportIntervalSeconds: v }),
            "How often the leader writes a long-form report summarizing the room, in seconds.",
            "sec",
          )} ${this.#renderNumberField(
            "python-timeout",
            "Python timeout",
            form.pythonTimeoutSeconds,
            (v) => this.#patchForm({ pythonTimeoutSeconds: v }),
            "Hard cap for a single Python script run, in seconds. Scripts that exceed this are killed.",
            "sec",
          )} ${this.#renderNumberField(
            "python-feedback-every",
            "Python feedback every",
            form.pythonFeedbackEvery,
            (v) => this.#patchForm({ pythonFeedbackEvery: v }),
            "Inject a status message back into the debate every N failed Python attempts so personas can react.",
            "fails",
          )}
        </div>
        <div class="schedule-grid">
          ${this.#renderBooleanSelect(
            "auto-pause",
            "Auto-pause after convergence",
            form.autoPauseWhenConverged,
            (value) => this.#patchForm({ autoPauseWhenConverged: value }),
            "When every persona signals they have nothing to add, ask the leader whether to pause until the next wake check.",
          )} ${this.#renderScheduleSelect(form)}
        </div>
        <div class="provider-grid">
          ${this.#renderProvider(
            "low",
            "Low tier",
            form.low,
            (next) => this.#patchForm({ low: next }),
          )} ${this.#renderProvider(
            "high",
            "High tier",
            form.high,
            (next) => this.#patchForm({ high: next }),
          )}
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

  #renderScheduleSelect(form: SettingsForm) {
    const known = RESUME_SCHEDULE_OPTIONS.some((item) =>
      item.cron === form.resumeScheduleCron
    );
    return html`
      <label class="form-field">
        ${this.#renderLabel(
          "wake-check",
          "Wake-check schedule",
          "Times are interpreted in UTC. When auto-paused, the leader checks at this cadence whether to resume the debate.",
        )}
        <wa-select
          size="small"
          .value="${form.resumeScheduleCron}"
          @change="${(e: Event): void => {
            const selected = readInputValue(e.target);
            const option = RESUME_SCHEDULE_OPTIONS.find((item) =>
              item.cron === selected
            );
            if (option === undefined) {
              return;
            }
            this.#patchForm({
              resumeScheduleCron: option.cron,
              resumeScheduleLabel: option.label,
            });
          }}"
        >
          ${!known
            ? html`
              <wa-option value="${form.resumeScheduleCron}">
                ${form.resumeScheduleLabel === ""
                  ? `Custom (${form.resumeScheduleCron})`
                  : form.resumeScheduleLabel}
              </wa-option>
            `
            : nothing} ${RESUME_SCHEDULE_OPTIONS.map((option) =>
              html`
                <wa-option value="${option.cron}">${option.label}</wa-option>
              `
            )}
        </wa-select>
      </label>
    `;
  }

  #renderProvider(
    keyPrefix: string,
    label: string,
    config: ProviderConfig,
    onChange: (config: ProviderConfig) => void,
  ) {
    const apiType: ApiType = config.apiType ?? "ollama";
    const tierTooltip = label === "Low tier"
      ? "Cheaper / faster model used for every debater turn."
      : "Higher-quality model used for steering nudges, halt/proceed gates, and reports.";
    const legendAnchor = `tip-${keyPrefix}-tier`;
    return html`
      <fieldset class="tier">
        <legend>
          <span>${label}</span>
          <wa-icon
            id="${legendAnchor}"
            class="help-icon"
            name="circle-question"
            tabindex="0"
          ></wa-icon>
        </legend>
        <wa-tooltip for="${legendAnchor}" placement="top">
          ${tierTooltip}
        </wa-tooltip>
        <label class="form-field">
          ${this.#renderLabel(
            `${keyPrefix}-api-type`,
            "API type",
            "Pick OpenRouter for any OpenAI-compatible endpoint (cloud or proxied) or Ollama for the native /api/chat protocol.",
          )}
          <wa-select
            size="small"
            .value="${apiType}"
            @change="${(e: Event): void => {
              const value = readInputValue(e.target);
              if (value === "ollama" || value === "openRouter") {
                const patch: Partial<ProviderConfig> = { apiType: value };
                if (value === "openRouter") {
                  patch.baseUrl = "https://openrouter.ai/api/v1";
                }
                onChange({ ...config, ...patch });
              }
            }}"
          >
            <wa-option value="ollama">Ollama</wa-option>
            <wa-option value="openRouter">OpenRouter</wa-option>
          </wa-select>
        </label>
        ${apiType === "ollama"
          ? this.#renderTextField(
            `${keyPrefix}-base-url`,
            "Base URL",
            config.baseUrl,
            (value) => onChange({ ...config, baseUrl: value }),
            "Server root, e.g. http://localhost:11434. Do not include /v1.",
          )
          : nothing} ${this.#renderTextField(
            `${keyPrefix}-model`,
            "Model",
            config.model,
            (model) => onChange({ ...config, model }),
            "Exact model identifier accepted by the provider, e.g. qwen3:14b or anthropic/claude-sonnet-4-6.",
          )} ${apiType === "openRouter"
          ? this.#renderTextField(
            `${keyPrefix}-api-key`,
            "API key",
            config.apiKey ?? "",
            (value) =>
              onChange({ ...config, apiKey: value === "" ? null : value }),
            "Required for OpenRouter; leave blank for self-hosted endpoints (Ollama / llama.cpp / vLLM). Stored plaintext locally and redacted in API responses.",
          )
          : nothing}
      </fieldset>
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
      background: this.form.background === "" ? null : this.form.background,
      chatIntervalSeconds: this.form.chatIntervalSeconds,
      steeringIntervalSeconds: this.form.steeringIntervalSeconds,
      reportIntervalSeconds: this.form.reportIntervalSeconds,
      pythonTimeoutSeconds: this.form.pythonTimeoutSeconds,
      pythonFeedbackEvery: this.form.pythonFeedbackEvery,
      autoPauseWhenConverged: this.form.autoPauseWhenConverged,
      resumeScheduleCron: this.form.resumeScheduleCron,
      resumeScheduleLabel: this.form.resumeScheduleLabel,
      low: this.form.low,
      high: this.form.high,
    };
    await this.store.updateRoom(this.room.id, request);
  }
}

function formFromRoom(room: Room): SettingsForm {
  return {
    topic: room.topic,
    goal: room.goal,
    instruction: room.instruction ?? "",
    background: room.background ?? "",
    chatIntervalSeconds: room.chatIntervalSeconds,
    steeringIntervalSeconds: room.steeringIntervalSeconds,
    reportIntervalSeconds: room.reportIntervalSeconds,
    pythonTimeoutSeconds: room.pythonTimeoutSeconds,
    pythonFeedbackEvery: room.pythonFeedbackEvery,
    autoPauseWhenConverged: room.autoPauseWhenConverged,
    resumeScheduleCron: room.resumeScheduleCron,
    resumeScheduleLabel: room.resumeScheduleLabel,
    low: { ...room.low },
    high: { ...room.high },
  };
}
