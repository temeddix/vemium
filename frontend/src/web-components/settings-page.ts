import { dashboardContext } from "@/app/context";
import type { DashboardState, DashboardStore } from "@/app/state";
import type {
  ApiType,
  ProviderConfig,
  UpdateAppSettingsRequest,
} from "@/app/types";
import { consume } from "@lit/context";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-settings-page": SettingsPage;
  }
}

interface SettingsForm {
  low: ProviderConfig;
  high: ProviderConfig;
}

const EMPTY_PROVIDER: ProviderConfig = {
  model: "",
  baseUrl: "http://localhost:11434",
  apiKey: null,
  apiType: "ollama",
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
 * Standalone page rendered at `/settings`. Edits the process-wide low/high
 * tier provider configuration that every room shares. Changes are saved
 * through the store; the backend nudges every active room so a key
 * rotation takes effect at the next turn.
 */
@customElement("te-settings-page")
export class SettingsPage extends LitElement {
  @consume({ context: dashboardContext, subscribe: true })
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor dashboardState: DashboardState | null = null;

  @state()
  private accessor form: SettingsForm | null = null;

  #unsubscribe: (() => void) | null = null;

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--wa-color-surface-default);
      padding: 1.2rem;
      box-sizing: border-box;
    }

    .container {
      max-width: 60rem;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .back-button {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--wa-color-text-normal);
      padding: 0.3rem;
      display: grid;
      place-items: center;
      border-radius: 0.4rem;
      font: inherit;
    }

    .back-button:hover {
      background: var(--wa-color-fill-quiet);
    }

    .title {
      font-size: 1.1rem;
      font-weight: 600;
    }

    .subtitle {
      font-size: 0.82rem;
      color: var(--wa-color-text-quiet);
      margin-left: auto;
    }

    .form-grid {
      display: grid;
      gap: 0.6rem;
    }

    .provider-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    @media (max-width: 720px) {
      .provider-grid {
        grid-template-columns: 1fr;
      }
    }

    fieldset.tier {
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      border-radius: 0.6rem;
      padding: 0.85rem 1rem;
      margin: 0;
      display: grid;
      gap: 0.5rem;
    }

    fieldset.tier legend {
      font-size: 0.85rem;
      font-weight: 600;
      padding: 0 0.4rem;
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
    this.#seedFormIfNeeded();
  }

  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    super.disconnectedCallback();
  }

  override render() {
    return html`
      <div class="container">
        <header class="header">
          <button class="back-button" @click="${this.#onBack}" title="Back">
            <wa-icon name="chevron-left"></wa-icon>
          </button>
          <span class="title">Global settings</span>
          <span class="subtitle">
            Shared by every room. API keys are stored locally and never returned in
            responses.
          </span>
        </header>
        ${this.#renderBody()}
      </div>
    `;
  }

  #renderBody() {
    const form = this.form;
    if (form === null) {
      return html`
        <p>Loading...</p>
      `;
    }
    const error = this.dashboardState?.errorMessage ?? null;
    const busy = this.dashboardState?.isSavingSettings ?? false;
    return html`
      ${error
        ? html`
          <div class="error-banner">${error}</div>
        `
        : nothing}
      <div class="form-grid">
        <div class="provider-grid">
          ${this.#renderProvider(
            "low",
            "Low tier",
            "Cheaper / faster model used for every debater turn.",
            form.low,
            (next) => {
              this.form = { ...form, low: next };
            },
          )} ${this.#renderProvider(
            "high",
            "High tier",
            "Higher-quality model used for steering nudges, halt/proceed gates, and reports.",
            form.high,
            (next) => {
              this.form = { ...form, high: next };
            },
          )}
        </div>
        <div class="footer-row">
          <wa-button
            size="small"
            ?disabled="${busy}"
            @click="${this.#onResetClick}"
          >
            Reset
          </wa-button>
          <wa-button
            size="small"
            ?disabled="${busy}"
            @click="${this.#onSaveClick}"
          >
            Save
          </wa-button>
        </div>
      </div>
    `;
  }

  #renderProvider(
    keyPrefix: string,
    label: string,
    tierTooltip: string,
    config: ProviderConfig,
    onChange: (config: ProviderConfig) => void,
  ) {
    const apiType: ApiType = config.apiType ?? "ollama";
    const legendAnchor = `tip-${keyPrefix}-tier`;
    return html`
      <fieldset class="tier">
        <legend>${label}</legend>
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
                } else if (config.baseUrl === "https://openrouter.ai/api/v1") {
                  patch.baseUrl = "http://localhost:11434";
                }
                onChange({ ...config, ...patch });
              }
            }}"
          >
            <wa-option value="ollama">Ollama</wa-option>
            <wa-option value="openRouter">OpenRouter</wa-option>
          </wa-select>
        </label>
        ${apiType === "openRouter"
          ? this.#renderPasswordField(
            `${keyPrefix}-api-key`,
            "API key",
            config.apiKey ?? "",
            (value) =>
              onChange({ ...config, apiKey: value === "" ? null : value }),
            "Required for OpenRouter. Leave it as-is (***) to keep the stored key, or type a new value to replace.",
          )
          : nothing} ${apiType === "ollama"
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
          )}
      </fieldset>
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

  #renderPasswordField(
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
          type="password"
          size="small"
          password-toggle
          .value="${value}"
          @input="${(e: InputEvent): void =>
            onChange(readInputValue(e.target))}"
        ></wa-input>
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

  #seedFormIfNeeded(): void {
    if (this.form !== null) {
      return;
    }
    const settings = this.dashboardState?.settings ?? null;
    if (settings === null) {
      return;
    }
    this.form = {
      low: { ...settings.low },
      high: { ...settings.high },
    };
  }

  #onResetClick(): void {
    const settings = this.dashboardState?.settings ?? null;
    if (settings === null) {
      this.form = { low: { ...EMPTY_PROVIDER }, high: { ...EMPTY_PROVIDER } };
      return;
    }
    this.form = {
      low: { ...settings.low },
      high: { ...settings.high },
    };
  }

  async #onSaveClick(): Promise<void> {
    if (this.form === null) {
      return;
    }
    const request: UpdateAppSettingsRequest = {
      low: this.form.low,
      high: this.form.high,
    };
    const ok = await this.store.saveSettings(request);
    if (ok) {
      this.#onBack();
    }
  }

  #onBack(): void {
    globalThis.history.pushState({}, "", "/");
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
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
