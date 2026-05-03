import { dashboardContext } from "@/app/context";
import type { DashboardState, DashboardStore } from "@/app/state";
import type {
  ApiType,
  CreateRoomRequest,
  ProviderConfig,
  Room,
  RoomStatus,
} from "@/app/types";
import { formatTimestamp } from "@/app/utils";
import { consume } from "@lit/context";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import "./room-detail.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-dashboard-view": DashboardView;
  }
}

interface CreateRoomForm {
  name: string;
  topic: string;
  goal: string;
  instruction: string;
  background: string;
  low: ProviderConfig;
  high: ProviderConfig;
}

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

@customElement("te-dashboard-view")
export class DashboardView extends LitElement {
  @consume({ context: dashboardContext, subscribe: true })
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor dashboardState: DashboardState | null = null;

  @state()
  private accessor showCreateForm: boolean = false;

  @state()
  private accessor formState: CreateRoomForm = { ...EMPTY_FORM };

  #unsubscribe: (() => void) | null = null;

  static override styles = css`
    :host {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 0.6rem;
      padding: 0.6rem;
      box-sizing: border-box;
      height: 100vh;
      overflow: hidden;
      background: var(--wa-color-surface-sunken);
    }

    .card {
      background: var(--wa-color-surface-default);
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      border-radius: 0.75rem;
    }

    .app-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.7rem 1.1rem;
    }

    .app-logo {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    .app-tagline {
      font-size: 0.8rem;
      color: var(--wa-color-text-quiet);
    }

    .ws-status {
      margin-left: auto;
    }

    .layout {
      display: grid;
      grid-template-columns: 22rem 1fr;
      grid-template-rows: 1fr;
      gap: 0.6rem;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.7rem 0.75rem 0.5rem;
      flex-shrink: 0;
    }

    .sidebar-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--wa-color-text-quiet);
      flex: 1;
    }

    .room-list {
      margin: 0;
      padding: 0.5rem;
      list-style: none;
      overflow-y: auto;
      flex: 1;
      display: grid;
      align-content: start;
      gap: 0.2rem;
    }

    .room-btn {
      width: 100%;
      text-align: left;
      background: none;
      border: var(--wa-border-width-s) solid transparent;
      border-radius: 0.5rem;
      padding: 0.55rem 0.75rem;
      cursor: pointer;
      display: grid;
      gap: 0.2rem;
      font: inherit;
      color: inherit;
    }

    .room-btn:hover {
      background: var(--wa-color-fill-quiet);
    }

    .room-btn.is-active {
      background: var(--wa-color-brand-fill-quiet);
      border-color: var(--wa-color-brand-border-normal);
    }

    .room-title {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .room-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }

    .room-time {
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
    }

    .empty-rooms {
      padding: 1.5rem 1rem;
      text-align: center;
      color: var(--wa-color-text-quiet);
      font-size: 0.875rem;
    }

    .detail {
      display: flex;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }

    te-room-detail {
      flex: 1;
      min-height: 0;
      min-width: 0;
    }

    .form-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      display: grid;
      place-items: center;
      padding: 1.5rem;
      z-index: 100;
    }

    .form-card {
      background: var(--wa-color-surface-default);
      border-radius: 0.75rem;
      padding: 1.25rem;
      width: min(40rem, 100%);
      max-height: 90vh;
      overflow-y: auto;
      display: grid;
      gap: 0.75rem;
    }

    .form-card h2 {
      margin: 0 0 0.25rem;
      font-size: 1.05rem;
    }

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

    .form-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      margin-top: 0.5rem;
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

  override updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has("store")) {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#bindStore();
    }
  }

  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    super.disconnectedCallback();
  }

  override render() {
    return html`
      <header class="app-header card">
        <span class="app-logo">Vemium</span>
        <span class="app-tagline">Endless agent debate</span>
        <span class="ws-status">${this.#renderWsStatus()}</span>
      </header>
      <div class="layout">
        <aside class="sidebar card">
          <div class="sidebar-header">
            <span class="sidebar-label">Rooms</span>
            <wa-button size="small" variant="brand" @click="${(): void =>
              this.#openCreate()}">
              + New
            </wa-button>
          </div>
          ${this.#renderRoomList()}
        </aside>
        <section class="detail">
          <te-room-detail .store="${this.store}"></te-room-detail>
        </section>
      </div>
      ${this.showCreateForm ? this.#renderCreateForm() : ""}
    `;
  }

  #renderWsStatus() {
    if (this.dashboardState === null) {
      return html`

      `;
    }
    const connected = this.dashboardState.wsConnected;
    const reconnect = this.dashboardState.reconnectAttempt;
    const variant = connected ? "success" : "warning";
    const label = connected ? "Connected" : `Reconnecting #${reconnect}`;
    return html`
      <wa-badge variant="${variant}">${label}</wa-badge>
    `;
  }

  #renderRoomList() {
    if (this.dashboardState === null) {
      return html`

      `;
    }
    const rooms = this.dashboardState.rooms;
    if (rooms.length === 0) {
      return html`
        <p class="empty-rooms">
          No rooms yet. Create one to start a debate.
        </p>
      `;
    }
    const currentId = this.dashboardState.currentRoomId;
    return html`
      <ul class="room-list">
        ${rooms.map((room) => this.#renderRoomItem(room, currentId))}
      </ul>
    `;
  }

  #renderRoomItem(room: Room, currentId: string | null) {
    const isActive = currentId === room.id;
    return html`
      <li>
        <button
          class="room-btn ${isActive ? "is-active" : ""}"
          @click="${(): void => this.store.selectRoom(room.id)}"
        >
          <span class="room-title">${room.name}</span>
          <span class="room-meta">
            <span class="room-time">${formatTimestamp(room.createdAt)}</span>
            ${this.#renderStatusBadge(room.status)}
          </span>
        </button>
      </li>
    `;
  }

  #renderStatusBadge(status: RoomStatus) {
    const variant = statusBadgeVariant(status);
    return html`
      <wa-badge variant="${variant}" size="small">${status}</wa-badge>
    `;
  }

  #renderCreateForm() {
    const busy = this.dashboardState?.isCreatingRoom ?? false;
    const error = this.dashboardState?.errorMessage ?? null;
    const form = this.formState;
    return html`
      <div class="form-overlay" @click="${(e: MouseEvent): void => {
        if (e.target === e.currentTarget) {
          this.#closeCreate();
        }
      }}">
        <div class="form-card">
          <h2>New room</h2>
          ${error
            ? html`
              <div class="error-banner">${error}</div>
            `
            : ""}
          <div class="form-grid">
            ${this.#renderTextField(
              "Name",
              form.name,
              (v) => this.#updateForm({ name: v }),
            )} ${this.#renderTextField(
              "Topic",
              form.topic,
              (v) => this.#updateForm({ topic: v }),
            )} ${this.#renderTextField(
              "Goal",
              form.goal,
              (v) => this.#updateForm({ goal: v }),
            )} ${this.#renderTextArea(
              "Instruction (optional)",
              form.instruction,
              (v) => this.#updateForm({ instruction: v }),
            )} ${this.#renderTextArea(
              "Background (optional)",
              form.background,
              (v) => this.#updateForm({ background: v }),
            )}
            <div class="provider-grid">
              ${this.#renderProvider(
                "Low tier",
                form.low,
                (next) => this.#updateForm({ low: next }),
              )} ${this.#renderProvider(
                "High tier",
                form.high,
                (next) => this.#updateForm({ high: next }),
              )}
            </div>
          </div>
          <div class="form-actions">
            <wa-button
              size="small"
              variant="neutral"
              ?disabled="${busy}"
              @click="${(): void => this.#closeCreate()}"
            >
              Cancel
            </wa-button>
            <wa-button
              size="small"
              variant="brand"
              ?disabled="${busy}"
              @click="${(): Promise<void> => this.#submitCreate()}"
            >
              Create
            </wa-button>
          </div>
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
        ${this.#renderApiTypeSelect(apiType, (next) => {
          const patch: Partial<ProviderConfig> = { apiType: next };
          if (next === "openRouter") {
            patch.baseUrl = "https://openrouter.ai/api/v1";
          }
          onChange({ ...config, ...patch });
        })} ${apiType === "ollama"
          ? this.#renderTextField(
            "Base URL (e.g. http://localhost:11434)",
            config.baseUrl,
            (value) => onChange({ ...config, baseUrl: value }),
          )
          : ""} ${this.#renderTextField(
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
          : ""}
      </fieldset>
    `;
  }

  #renderApiTypeSelect(
    current: ApiType,
    onChange: (next: ApiType) => void,
  ) {
    const options: { id: ApiType; label: string }[] = [
      { id: "ollama", label: "Ollama" },
      { id: "openRouter", label: "OpenRouter" },
    ];
    return html`
      <label class="form-field">
        <span class="form-label">API type</span>
        <wa-select size="small" .value="${current}" @change="${(
          e: Event,
        ): void => {
          const value = readInputValue(e.target);
          if (value === "ollama" || value === "openRouter") {
            onChange(value);
          }
        }}">
          ${options.map((opt) =>
            html`
              <wa-option value="${opt.id}">${opt.label}</wa-option>
            `
          )}
        </wa-select>
      </label>
    `;
  }

  #bindStore(): void {
    if (this.#unsubscribe !== null) {
      return;
    }
    this.#unsubscribe = this.store.subscribe((): void => {
      this.dashboardState = this.store.getState();
    });
    this.dashboardState = this.store.getState();
  }

  #openCreate(): void {
    this.formState = { ...EMPTY_FORM };
    this.showCreateForm = true;
  }

  #closeCreate(): void {
    this.showCreateForm = false;
  }

  #updateForm(patch: Partial<CreateRoomForm>): void {
    this.formState = { ...this.formState, ...patch };
  }

  async #submitCreate(): Promise<void> {
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
      low: this.formState.low,
      high: this.formState.high,
    };
    const created = await this.store.createRoom(request);
    if (created !== null) {
      this.showCreateForm = false;
    }
  }
}

function statusBadgeVariant(status: RoomStatus): string {
  switch (status) {
    case "active":
      return "brand";
    case "paused":
      return "neutral";
    case "failed":
      return "danger";
  }
}
