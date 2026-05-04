import type { DashboardStore } from "@/app/state";
import type {
  ApiType,
  ProviderConfig,
  Room,
  UpdateRoomRequest,
} from "@/app/types";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

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
  evaluationIntervalSeconds: number;
  reportIntervalSeconds: number;
  pythonTimeoutSeconds: number;
  pythonFeedbackEvery: number;
  low: ProviderConfig;
  high: ProviderConfig;
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
 * Modal that edits a single room's settings. Owns its own draft form
 * state, seeded from the `room` property whenever the dialog opens. Saves
 * are delegated to the store; the dialog keeps itself open so the user
 * can see error messages, and only closes on explicit cancel.
 */
@customElement("te-room-settings-dialog")
export class RoomSettingsDialog extends LitElement {
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @property({ attribute: false })
  accessor room: Room | null = null;

  @property({ type: Boolean })
  accessor open = false;

  @state()
  private accessor form: SettingsForm | null = null;

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

    .number-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      gap: 0.6rem;
    }

    .provider-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
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
  `;

  override updated(changed: Map<string, unknown>): void {
    const justOpened = changed.has("open") && this.open && !changed.get("open");
    const roomChanged = changed.has("room");
    if ((justOpened || roomChanged) && this.room !== null) {
      this.form = formFromRoom(this.room);
    }
  }

  override render() {
    const room = this.room;
    const form = this.form;
    return html`
      <wa-dialog
        label="Room settings"
        ?open="${this.open}"
        @wa-hide="${this.#onHide}"
      >
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
          "Topic",
          form.topic,
          (v) => this.#patchForm({ topic: v }),
        )} ${this.#renderTextField(
          "Goal",
          form.goal,
          (v) => this.#patchForm({ goal: v }),
        )} ${this.#renderTextArea(
          "Instruction",
          form.instruction,
          (v) => this.#patchForm({ instruction: v }),
        )} ${this.#renderTextArea(
          "Background",
          form.background,
          (v) => this.#patchForm({ background: v }),
        )}
        <div class="number-row">
          ${this.#renderNumberField(
            "Chat interval (sec)",
            form.chatIntervalSeconds,
            (v) => this.#patchForm({ chatIntervalSeconds: v }),
          )} ${this.#renderNumberField(
            "Eval interval (sec)",
            form.evaluationIntervalSeconds,
            (v) => this.#patchForm({ evaluationIntervalSeconds: v }),
          )} ${this.#renderNumberField(
            "Report interval (sec)",
            form.reportIntervalSeconds,
            (v) => this.#patchForm({ reportIntervalSeconds: v }),
          )} ${this.#renderNumberField(
            "Python timeout (sec)",
            form.pythonTimeoutSeconds,
            (v) => this.#patchForm({ pythonTimeoutSeconds: v }),
          )} ${this.#renderNumberField(
            "Python feedback every",
            form.pythonFeedbackEvery,
            (v) => this.#patchForm({ pythonFeedbackEvery: v }),
          )}
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

  #renderNumberField(
    label: string,
    value: number,
    onChange: (value: number) => void,
  ) {
    return html`
      <label class="form-field">
        <span class="form-label">${label}</span>
        <wa-input
          type="number"
          size="small"
          min="1"
          .value="${String(value)}"
          @input="${(e: InputEvent): void => {
            const parsed = Number.parseInt(readInputValue(e.target), 10);
            if (Number.isFinite(parsed)) {
              onChange(Math.max(1, parsed));
            }
          }}"
        ></wa-input>
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
            "Base URL",
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
      evaluationIntervalSeconds: this.form.evaluationIntervalSeconds,
      reportIntervalSeconds: this.form.reportIntervalSeconds,
      pythonTimeoutSeconds: this.form.pythonTimeoutSeconds,
      pythonFeedbackEvery: this.form.pythonFeedbackEvery,
      low: this.form.low,
      high: this.form.high,
    };
    await this.store.updateRoom(this.room.id, request);
  }

  #onHide(): void {
    if (!this.open) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("te-close", { bubbles: true, composed: true }),
    );
  }
}

function formFromRoom(room: Room): SettingsForm {
  return {
    topic: room.topic,
    goal: room.goal,
    instruction: room.instruction ?? "",
    background: room.background ?? "",
    chatIntervalSeconds: room.chatIntervalSeconds,
    evaluationIntervalSeconds: room.evaluationIntervalSeconds,
    reportIntervalSeconds: room.reportIntervalSeconds,
    pythonTimeoutSeconds: room.pythonTimeoutSeconds,
    pythonFeedbackEvery: room.pythonFeedbackEvery,
    low: { ...room.low },
    high: { ...room.high },
  };
}
