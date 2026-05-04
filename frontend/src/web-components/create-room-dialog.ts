import type { DashboardState, DashboardStore } from "@/app/state";
import type {
  ApiType,
  CreateRoomRequest,
  ProviderConfig,
  Room,
} from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-create-room-dialog": CreateRoomDialog;
  }
}

interface CreateRoomForm {
  name: string;
  topic: string;
  goal: string;
  instruction: string;
  background: string;
  autoPauseWhenConverged: boolean;
  resumeScheduleCron: string;
  resumeScheduleLabel: string;
  low: ProviderConfig;
  high: ProviderConfig;
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

const EMPTY_PROVIDER: ProviderConfig = {
  model: "",
  baseUrl: "",
  apiKey: null,
  apiType: "ollama",
};

const EMPTY_FORM: CreateRoomForm = {
  name: "",
  topic: "",
  goal: "",
  instruction: "",
  background: "",
  autoPauseWhenConverged: false,
  resumeScheduleCron: "0 * * * *",
  resumeScheduleLabel: "Every hour",
  low: { ...EMPTY_PROVIDER },
  high: { ...EMPTY_PROVIDER },
};

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
 * Modal that captures a brand-new [`Room`]. Resets the form to its empty
 * state every time `open` flips from false to true so leftover values
 * from a prior aborted creation don't bleed in.
 *
 * Emits `te-room-created` with the new room (parent uses it to navigate
 * to `/room/:slug`) and `te-close` when the user dismisses.
 */
@customElement("te-create-room-dialog")
export class CreateRoomDialog extends LitElement {
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @property({ type: Boolean })
  accessor open = false;

  @state()
  private accessor formState: CreateRoomForm = { ...EMPTY_FORM };

  @state()
  private accessor dashboardState: DashboardState | null = null;

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
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--wa-color-text-quiet);
    }

    .form-hint {
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
      margin: 0 0 0.2rem;
      line-height: 1.3;
    }

    .provider-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
    }

    .schedule-grid {
      display: grid;
      gap: 0.6rem;
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      border-radius: 0.5rem;
      padding: 0.6rem;
    }

    fieldset.tier {
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      border-radius: 0.5rem;
      padding: 0.6rem;
      display: grid;
      gap: 0.4rem;
    }

    fieldset.tier legend {
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0 0.3rem;
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
    if (changed.has("open") && this.open && !changed.get("open")) {
      this.formState = { ...EMPTY_FORM };
    }
  }

  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    super.disconnectedCallback();
  }

  override render() {
    const busy = this.dashboardState?.isCreatingRoom ?? false;
    const error = this.dashboardState?.errorMessage ?? null;
    const form = this.formState;
    return html`
      <wa-dialog
        label="New room"
        ?open="${this.open}"
        @wa-hide="${this.#onHide}"
      >
        ${error
          ? html`
            <div class="error-banner">${error}</div>
          `
          : nothing}
        <div class="form-grid">
          ${this.#renderTextField(
            "Name",
            form.name,
            (v) => this.#patchForm({ name: v }),
          )} ${this.#renderTextField(
            "Topic",
            form.topic,
            (v) => this.#patchForm({ topic: v }),
          )} ${this.#renderTextField(
            "Goal",
            form.goal,
            (v) => this.#patchForm({ goal: v }),
          )} ${this.#renderTextArea(
            "Instruction (optional)",
            form.instruction,
            (v) => this.#patchForm({ instruction: v }),
          )} ${this.#renderTextArea(
            "Background (optional)",
            form.background,
            (v) => this.#patchForm({ background: v }),
          )}
          <div class="schedule-grid">
            ${this.#renderBooleanSelect(
              "Auto-pause after convergence",
              form.autoPauseWhenConverged,
              (value) => this.#patchForm({ autoPauseWhenConverged: value }),
            )} ${this.#renderScheduleSelect(form)}
          </div>
          <div class="provider-grid">
            ${this.#renderProvider(
              "Low tier",
              form.low,
              (next) => this.#patchForm({ low: next }),
            )} ${this.#renderProvider(
              "High tier",
              form.high,
              (next) => this.#patchForm({ high: next }),
            )}
          </div>
        </div>
        <div slot="footer" class="footer-row">
          <wa-button
            size="small"
            ?disabled="${busy}"
            @click="${this.#requestClose}"
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
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) {
    return html`
      <label class="form-field">
        <span class="form-label">${label}</span>
        <wa-input size="small" .value="${value}" @input="${(
          e: InputEvent,
        ): void => onChange(readInputValue(e.target))}"></wa-input>
      </label>
    `;
  }

  #renderTextArea(
    label: string,
    value: string,
    onChange: (value: string) => void,
  ) {
    return html`
      <label class="form-field">
        <span class="form-label">${label}</span>
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

  #renderProvider(
    label: string,
    config: ProviderConfig,
    onChange: (config: ProviderConfig) => void,
  ) {
    const apiType: ApiType = config.apiType ?? "ollama";
    return html`
      <fieldset class="tier">
        <legend>${label}</legend>
        <p class="form-hint">
          Only OpenRouter requires an API key; Ollama / llama.cpp / vLLM and other
          self-hosted endpoints leave it blank.
        </p>
        <label class="form-field">
          <span class="form-label">API type</span>
          <wa-select size="small" .value="${apiType}" @change="${(
            e: Event,
          ): void => {
            const value = readInputValue(e.target);
            if (value === "ollama" || value === "openRouter") {
              const patch: Partial<ProviderConfig> = { apiType: value };
              if (value === "openRouter") {
                patch.baseUrl = "https://openrouter.ai/api/v1";
              }
              onChange({ ...config, ...patch });
            }
          }}">
            <wa-option value="ollama">Ollama</wa-option>
            <wa-option value="openRouter">OpenRouter</wa-option>
          </wa-select>
        </label>
        ${apiType === "ollama"
          ? this.#renderTextField(
            "Base URL (e.g. http://localhost:11434)",
            config.baseUrl,
            (value) => onChange({ ...config, baseUrl: value }),
          )
          : nothing} ${this.#renderTextField(
            "Model",
            config.model,
            (model) => onChange({ ...config, model }),
          )} ${apiType === "openRouter"
          ? this.#renderTextField(
            "API key (required for OpenRouter)",
            config.apiKey ?? "",
            (value) =>
              onChange({ ...config, apiKey: value === "" ? null : value }),
          )
          : nothing}
      </fieldset>
    `;
  }

  #renderBooleanSelect(
    label: string,
    value: boolean,
    onChange: (value: boolean) => void,
  ) {
    return html`
      <label class="form-field">
        <span class="form-label">${label}</span>
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

  #renderScheduleSelect(form: CreateRoomForm) {
    return html`
      <label class="form-field">
        <span class="form-label">Wake-check schedule (UTC)</span>
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
          ${RESUME_SCHEDULE_OPTIONS.map((option) =>
            html`
              <wa-option value="${option.cron}">${option.label}</wa-option>
            `
          )}
        </wa-select>
      </label>
    `;
  }

  #patchForm(patch: Partial<CreateRoomForm>): void {
    this.formState = { ...this.formState, ...patch };
  }

  async #submit(): Promise<void> {
    const request: CreateRoomRequest = {
      name: this.formState.name,
      topic: this.formState.topic,
      goal: this.formState.goal,
      instruction: this.formState.instruction === ""
        ? null
        : this.formState.instruction,
      background: this.formState.background === ""
        ? null
        : this.formState.background,
      autoPauseWhenConverged: this.formState.autoPauseWhenConverged,
      resumeScheduleCron: this.formState.resumeScheduleCron,
      resumeScheduleLabel: this.formState.resumeScheduleLabel,
      low: this.formState.low,
      high: this.formState.high,
    };
    const created: Room | null = await this.store.createRoom(request);
    if (created !== null) {
      this.dispatchEvent(
        new CustomEvent("te-room-created", {
          detail: { room: created },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  #requestClose(): void {
    this.dispatchEvent(
      new CustomEvent("te-close", { bubbles: true, composed: true }),
    );
  }

  #onHide(): void {
    if (this.open) {
      this.#requestClose();
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
