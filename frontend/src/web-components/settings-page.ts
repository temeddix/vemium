import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/tooltip/tooltip.js";
import { consume } from "@lit/context";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { dashboardContext } from "#context";
import type { DashboardState, DashboardStore, Tier } from "#state";
import type { ApiType, ProviderConfig, UpdateAppSettingsRequest } from "#types";
import { navigateTo } from "#utils";

import {
  type FieldSpec,
  readInputValue,
  renderLabel,
  renderPasswordField,
  renderTextField,
} from "./form-fields.ts";
import { ModelListController } from "./model-list-controller.ts";
import { StoreController } from "./store-controller.ts";
import { UpdateEffectController } from "./update-effect-controller.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-settings-page": SettingsPageElement;
  }
}

interface SettingsForm {
  low: ProviderConfig;
  high: ProviderConfig;
}

/** How a tier's fieldset introduces itself. */
interface TierSpec {
  tier: Tier;
  /** Lowercase name, used in element ids. */
  key: string;
  label: string;
  tooltip: string;
}

const LOW_TIER: TierSpec = {
  tier: "LOW",
  key: "low",
  label: "Low tier",
  tooltip: "Cheaper / faster model used for every debater turn.",
};

const HIGH_TIER: TierSpec = {
  tier: "HIGH",
  key: "high",
  label: "High tier",
  tooltip:
    "Higher-quality model used for steering nudges, halt/proceed gates, and reports.",
};

const OPEN_ROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPEN_AI_BASE_URL = "http://localhost:1234/v1";
const OLLAMA_BASE_URL = "http://localhost:11434";

const MODEL_TOOLTIP =
  "Exact model identifier accepted by the provider, e.g. qwen3:14b or anthropic/claude-sonnet-4-6.";

const EMPTY_PROVIDER: ProviderConfig = {
  model: "",
  baseUrl: OLLAMA_BASE_URL,
  apiKey: null,
  apiType: "OLLAMA",
};

/** Whether a string is an `ApiType`. */
function isApiType(value: string): value is ApiType {
  return value === "OLLAMA" || value === "OPEN_ROUTER" || value === "OPEN_AI";
}

/** A tier's configuration within the form. */
function tierConfig(form: SettingsForm, tier: Tier): ProviderConfig {
  return tier === "LOW" ? form.low : form.high;
}

/** The form with one tier's configuration replaced. */
function withTierConfig(
  form: SettingsForm,
  tier: Tier,
  config: ProviderConfig,
): SettingsForm {
  return tier === "LOW" ? { ...form, low: config } : { ...form, high: config };
}

/**
 * The tier of the fieldset an event came from, read from its `data-tier`.
 * Null when the event did not come from inside a tier's fieldset.
 */
function tierOf(event: Event): Tier | null {
  const target = event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  const fieldset = target.closest("fieldset[data-tier]");
  if (!(fieldset instanceof HTMLElement)) {
    return null;
  }
  const tier = fieldset.dataset["tier"];
  return tier === "LOW" || tier === "HIGH" ? tier : null;
}

/**
 * The configuration after picking `apiType`: switching to OpenRouter or an
 * OpenAI-compatible server fills in its usual base URL, and switching back
 * to Ollama restores Ollama's when the URL was one of those defaults.
 */
function withApiType(config: ProviderConfig, apiType: ApiType): ProviderConfig {
  if (apiType === "OPEN_ROUTER") {
    return { ...config, apiType, baseUrl: OPEN_ROUTER_BASE_URL };
  }
  if (apiType === "OPEN_AI") {
    return { ...config, apiType, baseUrl: OPEN_AI_BASE_URL };
  }
  if (
    config.baseUrl === OPEN_ROUTER_BASE_URL ||
    config.baseUrl === OPEN_AI_BASE_URL
  ) {
    return { ...config, apiType, baseUrl: OLLAMA_BASE_URL };
  }
  return { ...config, apiType };
}

/**
 * Standalone page rendered at `/settings`. Edits the process-wide low/high
 * tier provider configuration that every room shares. Changes are saved
 * through the store; the backend nudges every active room so a key
 * rotation takes effect at the next turn.
 */
@customElement("te-settings-page")
export class SettingsPageElement extends LitElement {
  @consume({ context: dashboardContext, subscribe: true })
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  accessor dashboardState: DashboardState | null = null;

  @state()
  accessor form: SettingsForm | null = null;

  #lowModels: ModelListController = new ModelListController(this).forTier(
    "LOW",
    (): DashboardStore => this.store,
  );

  #highModels: ModelListController = new ModelListController(this).forTier(
    "HIGH",
    (): DashboardStore => this.store,
  );

  storeSubscription: StoreController = new StoreController(this).track(
    (): DashboardStore | null => this.store,
    (next: DashboardState): void => {
      this.dashboardState = next;
    },
  );

  effects: UpdateEffectController = new UpdateEffectController(this).onUpdated(
    (): void => {
      this.#seedFormIfNeeded();
      if (this.form !== null) {
        this.#lowModels.schedule(this.form.low);
        this.#highModels.schedule(this.form.high);
      }
    },
  );

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
  override render(): TemplateResult {
    const body = this.#renderBody();
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
        ${body}
      </div>
    `;
  }

  #renderBody(): TemplateResult {
    const form = this.form;
    if (form === null) {
      return html`
        <p>Loading...</p>
      `;
    }
    const error = this.dashboardState?.errorMessage ?? null;
    const busy = this.dashboardState?.isSavingSettings ?? false;
    const errorBanner =
      error === null || error === ""
        ? nothing
        : html`
          <div class="error-banner">${error}</div>
        `;
    const low = this.#renderProvider(LOW_TIER, form.low);
    const high = this.#renderProvider(HIGH_TIER, form.high);
    return html`
      ${errorBanner}
      <div class="form-grid">
        <div class="provider-grid">${low} ${high}</div>
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

  #renderProvider(spec: TierSpec, config: ProviderConfig): TemplateResult {
    const apiType: ApiType = config.apiType ?? "OLLAMA";
    const legendAnchor = `tip-${spec.key}-tier`;
    const apiTypeLabel = renderLabel({
      key: `${spec.key}-api-type`,
      label: "API type",
      tooltip: "Pick the provider protocol used by this tier.",
    });
    const apiKey =
      apiType === "OLLAMA"
        ? nothing
        : renderPasswordField(
            apiKeyField(spec, apiType),
            config.apiKey ?? "",
            this.#onApiKeyInput,
          );
    const baseUrl = renderTextField(
      baseUrlField(spec, apiType),
      config.baseUrl,
      this.#onBaseUrlInput,
    );
    const model = this.#renderModelField(spec, config);
    return html`
      <fieldset class="tier" data-tier="${spec.tier}">
        <legend>${spec.label}</legend>
        <wa-tooltip for="${legendAnchor}" placement="top">
          ${spec.tooltip}
        </wa-tooltip>
        <label class="form-field">
          ${apiTypeLabel}
          <wa-select
            size="small"
            .value="${apiType}"
            @change="${this.#onApiTypeChange}"
          >
            <wa-option value="OLLAMA">Ollama</wa-option>
            <wa-option value="OPEN_ROUTER">OpenRouter</wa-option>
            <wa-option value="OPEN_AI">OpenAI Compatible</wa-option>
          </wa-select>
        </label>
        ${apiKey} ${baseUrl} ${model}
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
  #renderModelField(spec: TierSpec, config: ProviderConfig): TemplateResult {
    const list = spec.tier === "LOW" ? this.#lowModels : this.#highModels;
    const label = renderLabel({
      key: `${spec.key}-model`,
      label: "Model",
      tooltip: MODEL_TOOLTIP,
    });
    const status = renderModelStatus(list.loading, list.error);
    if (list.models === null) {
      return html`
        <label class="form-field">
          ${label}
          <wa-input
            size="small"
            .value="${config.model}"
            @input="${this.#onModelInput}"
          ></wa-input>
          ${status}
        </label>
      `;
    }
    const ids = list.models.map((entry) => entry.id);
    const hasCurrent = config.model !== "" && ids.includes(config.model);
    const custom =
      !hasCurrent && config.model !== ""
        ? html`
          <wa-option value="${config.model}">${config.model} (custom)</wa-option>
        `
        : nothing;
    const options = ids.map(
      (id) =>
        html`
          <wa-option value="${id}">${id}</wa-option>
        `,
    );
    return html`
      <label class="form-field">
        ${label}
        <wa-select
          size="small"
          .value="${config.model}"
          @change="${this.#onModelInput}"
        >
          ${custom} ${options}
        </wa-select>
        ${status}
      </label>
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

  /** Replaces the configuration of the tier an event came from. */
  #updateTier(
    event: Event,
    update: (config: ProviderConfig) => ProviderConfig,
  ): void {
    const tier = tierOf(event);
    const form = this.form;
    if (tier === null || form === null) {
      return;
    }
    this.form = withTierConfig(form, tier, update(tierConfig(form, tier)));
  }

  #onApiTypeChange = (event: Event): void => {
    const value = readInputValue(event.target);
    if (isApiType(value)) {
      this.#updateTier(event, (config) => withApiType(config, value));
    }
  };

  #onApiKeyInput = (event: Event): void => {
    const value = readInputValue(event.target);
    this.#updateTier(event, (config) => ({
      ...config,
      apiKey: value === "" ? null : value,
    }));
  };

  #onBaseUrlInput = (event: Event): void => {
    const baseUrl = readInputValue(event.target);
    this.#updateTier(event, (config) => ({ ...config, baseUrl }));
  };

  #onModelInput = (event: Event): void => {
    const model = readInputValue(event.target);
    this.#updateTier(event, (config) => ({ ...config, model }));
  };

  #onResetClick = (): void => {
    const settings = this.dashboardState?.settings ?? null;
    if (settings === null) {
      this.form = { low: { ...EMPTY_PROVIDER }, high: { ...EMPTY_PROVIDER } };
      return;
    }
    this.form = {
      low: { ...settings.low },
      high: { ...settings.high },
    };
  };

  #onSaveClick = async (): Promise<void> => {
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
  };

  #onBack = (): void => {
    navigateTo("/");
  };
}

/** The API key field of a tier, with help text for its provider. */
function apiKeyField(spec: TierSpec, apiType: ApiType): FieldSpec {
  return {
    key: `${spec.key}-api-key`,
    label: "API key",
    tooltip:
      apiType === "OPEN_ROUTER"
        ? "Required for OpenRouter. Leave it as-is (***) to keep the stored key, or type a new value to replace."
        : "Optional bearer token. Leave it as-is (***) to keep the stored key, or type a new value to replace.",
  };
}

/** The base URL field of a tier, with help text for its provider. */
function baseUrlField(spec: TierSpec, apiType: ApiType): FieldSpec {
  return {
    key: `${spec.key}-base-url`,
    label: "Base URL",
    tooltip:
      apiType === "OLLAMA"
        ? "Server root, e.g. http://localhost:11434. Do not include /v1."
        : "OpenAI-compatible API root, e.g. http://localhost:1234/v1.",
  };
}

/** The line under a model field: fetching, the fetch error, or nothing. */
function renderModelStatus(
  loading: boolean,
  error: string | null,
): TemplateResult {
  if (loading) {
    return html`
      <span class="model-status">Fetching models...</span>
    `;
  }
  if (error !== null) {
    return html`
      <span class="model-status error">${error}</span>
    `;
  }
  return html``;
}
