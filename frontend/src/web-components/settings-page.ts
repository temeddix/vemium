import { dashboardContext } from "@/app/context";
import type { DashboardState, DashboardStore } from "@/app/state";
import type {
  ApiType,
  ProviderConfig,
  ProviderModelOption,
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

type Tier = "low" | "high";

/**
 * Per-tier state for the auto-fetched model list. `models === null` means
 * "no list available" (initial render, fetch error, or incomplete config);
 * the model field falls back to a free-text input in that case so the user
 * is never blocked by a flaky provider.
 */
interface TierModelsState {
  models: ProviderModelOption[] | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_TIER_MODELS: TierModelsState = {
  models: null,
  loading: false,
  error: null,
};

/**
 * Debounce window between the last form edit and the fetch request. Long
 * enough to coalesce keystrokes while typing a base URL, short enough that
 * the dropdown feels responsive after the user stops.
 */
const MODELS_FETCH_DEBOUNCE_MS = 500;

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
 * Returns true when `config` carries the minimum fields the backend will
 * accept for a model-list lookup. Mirrors the validation in
 * `routes::list_provider_models` so we can suppress noisy "Could not list
 * models (HTTP 400)" toasts while the user is still filling out the form.
 */
function canFetchModels(config: ProviderConfig): boolean {
  if (config.baseUrl.trim() === "") {
    return false;
  }
  if ((config.apiType ?? "ollama") === "openRouter") {
    const key = config.apiKey;
    if (key === null || key.trim() === "") {
      return false;
    }
  }
  return true;
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

  @state()
  private accessor modelsState: Record<Tier, TierModelsState> = {
    low: INITIAL_TIER_MODELS,
    high: INITIAL_TIER_MODELS,
  };

  #unsubscribe: (() => void) | null = null;
  #debounce: Record<Tier, ReturnType<typeof setTimeout> | null> = {
    low: null,
    high: null,
  };
  /**
   * Last config fingerprint we kicked a fetch for, per tier. Lets
   * `updated()` skip re-scheduling when an unrelated piece of state changed
   * (e.g. an in-flight fetch resolving and updating `modelsState`).
   */
  #lastFingerprint: Record<Tier, string | null> = { low: null, high: null };
  /**
   * Per-tier monotonic counter incremented every time we kick a fetch.
   * In-flight callbacks compare their captured value against the current
   * counter and bail if a newer fetch has been scheduled in the meantime.
   */
  #fetchSeq: Record<Tier, number> = { low: 0, high: 0 };

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

    .model-status {
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
    }

    .model-status.error {
      color: var(--wa-color-danger-on-quiet);
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
    if (this.form !== null) {
      this.#scheduleModelFetch("low", this.form.low);
      this.#scheduleModelFetch("high", this.form.high);
    }
  }

  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    for (const tier of ["low", "high"] as const) {
      const timer = this.#debounce[tier];
      if (timer !== null) {
        clearTimeout(timer);
        this.#debounce[tier] = null;
      }
    }
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
    tier: Tier,
    label: string,
    tierTooltip: string,
    config: ProviderConfig,
    onChange: (config: ProviderConfig) => void,
  ) {
    const apiType: ApiType = config.apiType ?? "ollama";
    const legendAnchor = `tip-${tier}-tier`;
    return html`
      <fieldset class="tier">
        <legend>${label}</legend>
        <wa-tooltip for="${legendAnchor}" placement="top">
          ${tierTooltip}
        </wa-tooltip>
        <label class="form-field">
          ${this.#renderLabel(
            `${tier}-api-type`,
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
            `${tier}-api-key`,
            "API key",
            config.apiKey ?? "",
            (value) =>
              onChange({ ...config, apiKey: value === "" ? null : value }),
            "Required for OpenRouter. Leave it as-is (***) to keep the stored key, or type a new value to replace.",
          )
          : nothing} ${apiType === "ollama"
          ? this.#renderTextField(
            `${tier}-base-url`,
            "Base URL",
            config.baseUrl,
            (value) => onChange({ ...config, baseUrl: value }),
            "Server root, e.g. http://localhost:11434. Do not include /v1.",
          )
          : nothing} ${this.#renderModelField(
            tier,
            config,
            this.modelsState[tier],
            (model) => onChange({ ...config, model }),
          )}
      </fieldset>
    `;
  }

  /**
   * Renders the model picker. Uses a `wa-select` populated from the
   * provider's tags/models endpoint when a list is available; falls back to
   * a free-text input otherwise (initial render, fetch error, or
   * incomplete config) so the user can always type a model identifier even
   * if discovery fails. The current `config.model` is preserved as a
   * "(custom)" entry when it is not present in the fetched list, so
   * stale-but-valid values survive provider hiccups.
   */
  #renderModelField(
    tier: Tier,
    config: ProviderConfig,
    state: TierModelsState,
    onChange: (model: string) => void,
  ) {
    const tooltip =
      "Exact model identifier accepted by the provider, e.g. qwen3:14b or anthropic/claude-sonnet-4-6.";
    const labelKey = `${tier}-model`;
    if (state.models !== null) {
      const ids = state.models.map((entry) => entry.id);
      const hasCurrent = config.model !== "" && ids.includes(config.model);
      return html`
        <label class="form-field">
          ${this.#renderLabel(labelKey, "Model", tooltip)}
          <wa-select
            size="small"
            .value="${config.model}"
            @change="${(e: Event): void => onChange(readInputValue(e.target))}"
          >
            ${!hasCurrent && config.model !== ""
              ? html`
                <wa-option value="${config.model}">
                  ${config.model} (custom)
                </wa-option>
              `
              : nothing} ${ids.map((id) =>
                html`
                  <wa-option value="${id}">${id}</wa-option>
                `
              )}
          </wa-select>
          ${this.#renderModelStatus(state)}
        </label>
      `;
    }
    return html`
      <label class="form-field">
        ${this.#renderLabel(labelKey, "Model", tooltip)}
        <wa-input
          size="small"
          .value="${config.model}"
          @input="${(e: InputEvent): void =>
            onChange(readInputValue(e.target))}"
        ></wa-input>
        ${this.#renderModelStatus(state)}
      </label>
    `;
  }

  #renderModelStatus(state: TierModelsState) {
    if (state.loading) {
      return html`
        <span class="model-status">Fetching models...</span>
      `;
    }
    if (state.error !== null) {
      return html`
        <span class="model-status error">${state.error}</span>
      `;
    }
    return nothing;
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

  /**
   * Reacts to `form` changes by re-fetching the model list when the
   * fetch-relevant fields (api type, base URL, api key) change. Other
   * edits - most notably `model` itself - leave the dropdown alone so the
   * list does not flicker every keystroke when the user is just picking a
   * model. The fingerprint check makes this a no-op when called with
   * unchanged config, so it is safe to invoke from every `updated()`.
   */
  #scheduleModelFetch(tier: Tier, config: ProviderConfig): void {
    const fingerprint = JSON.stringify({
      apiType: config.apiType ?? "ollama",
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
    if (this.#lastFingerprint[tier] === fingerprint) {
      return;
    }
    this.#lastFingerprint[tier] = fingerprint;

    const pending = this.#debounce[tier];
    if (pending !== null) {
      clearTimeout(pending);
      this.#debounce[tier] = null;
    }
    // Bumping the seq invalidates any earlier in-flight fetch for this
    // tier so its result cannot overwrite the new state when it lands.
    const seq = ++this.#fetchSeq[tier];

    if (!canFetchModels(config)) {
      this.#updateTier(tier, INITIAL_TIER_MODELS);
      return;
    }

    this.#updateTier(tier, {
      models: this.modelsState[tier].models,
      loading: true,
      error: null,
    });

    this.#debounce[tier] = setTimeout((): void => {
      this.#debounce[tier] = null;
      void this.#runModelFetch(tier, config, seq);
    }, MODELS_FETCH_DEBOUNCE_MS);
  }

  async #runModelFetch(
    tier: Tier,
    config: ProviderConfig,
    seq: number,
  ): Promise<void> {
    const result = await this.store.fetchProviderModels(tier, config);
    if (this.#fetchSeq[tier] !== seq) {
      return;
    }
    this.#updateTier(tier, {
      models: result.error === null ? result.models : null,
      loading: false,
      error: result.error,
    });
  }

  #updateTier(tier: Tier, next: TierModelsState): void {
    this.modelsState = { ...this.modelsState, [tier]: next };
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
