import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { DashboardStore, Tier } from "#state";
import type { ProviderConfig, ProviderModelOption } from "#types";

/**
 * Debounce window between the last form edit and the fetch request. Long
 * enough to coalesce keystrokes while typing a base URL, short enough that
 * the dropdown feels responsive after the user stops.
 */
const MODELS_FETCH_DEBOUNCE_MS = 500;

/** Hands the controller the store the host currently holds. */
type StoreGetter = () => DashboardStore;

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
  if ((config.apiType ?? "OLLAMA") === "OPEN_ROUTER") {
    const key = config.apiKey;
    if (key === null || key.trim() === "") {
      return false;
    }
  }
  return true;
}

/**
 * The auto-fetched model list of one provider tier. `models === null` means
 * "no list available" (initial render, fetch error, or incomplete config);
 * the model field falls back to a free-text input in that case so the user
 * is never blocked by a flaky provider.
 *
 * A pending fetch is debounced, and a timer still waiting when the host
 * leaves the document is cleared.
 */
export class ModelListController implements ReactiveController {
  #host: ReactiveControllerHost;
  #tier: Tier = "LOW";
  #getStore: StoreGetter | null = null;
  #debounce: number | null = null;
  /**
   * Last config fingerprint we kicked a fetch for. Lets the host skip
   * re-scheduling when an unrelated piece of state changed (e.g. an
   * in-flight fetch resolving and updating the list).
   */
  #lastFingerprint: string | null = null;
  /**
   * Monotonic counter incremented every time we kick a fetch. In-flight
   * callbacks compare their captured value against the current counter
   * and bail if a newer fetch has been scheduled in the meantime.
   */
  #fetchSeq: number = 0;

  /** The fetched models, or null when no list is available. */
  models: ProviderModelOption[] | null = null;

  /** Whether a fetch is pending or in flight. */
  loading: boolean = false;

  /** Why the last fetch failed, or null. */
  error: string | null = null;

  constructor(host: ReactiveControllerHost) {
    this.#host = host;
    host.addController(this);
  }

  /** Sets which tier this list belongs to and where the store comes from. */
  forTier(tier: Tier, getStore: StoreGetter): this {
    this.#tier = tier;
    this.#getStore = getStore;
    return this;
  }

  /**
   * Reacts to config changes by re-fetching the model list when the
   * fetch-relevant fields (api type, base URL, api key) change. Other
   * edits - most notably `model` itself - leave the dropdown alone so the
   * list does not flicker every keystroke when the user is just picking a
   * model. The fingerprint check makes this a no-op when called with
   * unchanged config, so it is safe to invoke after every host update.
   */
  schedule(config: ProviderConfig): void {
    const fingerprint = JSON.stringify({
      apiType: config.apiType ?? "OLLAMA",
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
    if (this.#lastFingerprint === fingerprint) {
      return;
    }
    this.#lastFingerprint = fingerprint;
    this.#clearTimer();
    // Bumping the seq invalidates any earlier in-flight fetch for this
    // tier so its result cannot overwrite the new state when it lands.
    this.#fetchSeq += 1;
    const seq = this.#fetchSeq;

    if (!canFetchModels(config)) {
      this.#set(null, false, null);
      return;
    }

    this.#set(this.models, true, null);
    this.#debounce = globalThis.setTimeout((): void => {
      this.#debounce = null;
      void this.#run(config, seq);
    }, MODELS_FETCH_DEBOUNCE_MS);
  }

  hostConnected(): void {
    // A fetch cleared on the way out has to run again on the way back in.
    this.#lastFingerprint = null;
  }

  hostDisconnected(): void {
    this.#clearTimer();
  }

  async #run(config: ProviderConfig, seq: number): Promise<void> {
    if (this.#getStore === null) {
      return;
    }
    const result = await this.#getStore().fetchProviderModels(
      this.#tier,
      config,
    );
    if (this.#fetchSeq !== seq) {
      return;
    }
    this.#set(
      result.error === null ? result.models : null,
      false,
      result.error,
    );
  }

  #set(
    models: ProviderModelOption[] | null,
    loading: boolean,
    error: string | null,
  ): void {
    this.models = models;
    this.loading = loading;
    this.error = error;
    this.#host.requestUpdate();
  }

  #clearTimer(): void {
    if (this.#debounce !== null) {
      globalThis.clearTimeout(this.#debounce);
      this.#debounce = null;
    }
  }
}
