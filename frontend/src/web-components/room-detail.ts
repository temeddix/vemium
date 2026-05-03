import type { DashboardState, DashboardStore } from "@/app/state";
import type {
  ProviderConfig,
  ProviderKind,
  Room,
  RoomView,
  ToolCallEntry,
  TurnBuffer,
  UpdateRoomRequest,
} from "@/app/types";
import { formatTimestamp } from "@/app/utils";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-detail": RoomDetail;
  }
}

type Tab = "stream" | "settings" | "reports";

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

function renderMarkdown(content: string) {
  return html`
    <wa-markdown ${ref((el) => {
      if (el === undefined) {
        return;
      }
      let script = el.querySelector('script[type="text/markdown"]');
      if (script === null) {
        script = document.createElement("script");
        script.setAttribute("type", "text/markdown");
        el.appendChild(script);
      }
      if (script.textContent !== content) {
        script.textContent = content;
        (el as { renderMarkdown?: () => void }).renderMarkdown?.();
      }
    })}></wa-markdown>
  `;
}

@customElement("te-room-detail")
export class RoomDetail extends LitElement {
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor dashboardState: DashboardState | null = null;

  @state()
  private accessor activeTab: Tab = "stream";

  @state()
  private accessor settingsForm: SettingsForm | null = null;

  @state()
  private accessor settingsRoomId: string | null = null;

  #unsubscribe: (() => void) | null = null;

  static override styles = css`
    :host {
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 0.6rem;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
    }

    .card {
      background: var(--wa-color-surface-default);
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      border-radius: 0.75rem;
    }

    .empty-card {
      grid-row: 1 / -1;
      display: grid;
      place-items: center;
      padding: 2rem;
      color: var(--wa-color-text-quiet);
      text-align: center;
    }

    .empty {
      padding: 2rem;
      text-align: center;
      color: var(--wa-color-text-quiet);
    }

    .room-header {
      padding: 0.7rem 1.1rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .room-name {
      font-weight: 600;
      font-size: 1rem;
    }

    .room-topic {
      color: var(--wa-color-text-quiet);
      font-size: 0.85rem;
    }

    .room-actions {
      margin-left: auto;
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    .tab-bar {
      display: flex;
      gap: 0.4rem;
      padding: 0.45rem 0.6rem;
    }

    .tab-btn {
      background: none;
      border: var(--wa-border-width-s) solid transparent;
      padding: 0.35rem 0.75rem;
      border-radius: 0.4rem;
      cursor: pointer;
      font: inherit;
      font-size: 0.85rem;
      color: var(--wa-color-text-quiet);
    }

    .tab-btn.is-active {
      background: var(--wa-color-brand-fill-quiet);
      border-color: var(--wa-color-brand-border-normal);
      color: var(--wa-color-brand-on-quiet);
    }

    .panel {
      min-height: 0;
      overflow-y: auto;
      padding: 1rem 1.25rem;
    }

    .turn-list {
      display: grid;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .turn-item {
      width: min(100%, 44rem);
    }

    .turn-meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
      margin-bottom: 0.3rem;
    }

    .turn-leader wa-card::part(base) {
      border-color: var(--wa-color-brand-border-normal);
      background: var(--wa-color-brand-fill-quiet);
    }

    .turn-streaming wa-card::part(base) {
      border-style: dashed;
    }

    .turn-failed wa-card::part(base) {
      border-color: var(--wa-color-danger-border-normal);
      background: var(--wa-color-danger-fill-quiet);
    }

    .tool-list {
      display: grid;
      gap: 0.4rem;
      margin: 0.5rem 0 0;
      padding: 0.4rem 0 0 0.6rem;
      list-style: none;
      border-left: var(--wa-border-width-s) solid var(--wa-color-border-normal);
    }

    .tool-list > li {
      display: grid;
      gap: 0.25rem;
    }

    .tool-meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
    }

    .tool-args {
      font-family: var(--wa-font-family-code, monospace);
      font-size: 0.75rem;
      color: var(--wa-color-text-quiet);
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
    }

    .tool-output {
      font-family: var(--wa-font-family-code, monospace);
      font-size: 0.78rem;
      white-space: pre-wrap;
      margin: 0;
    }

    .form-grid {
      display: grid;
      gap: 0.6rem;
      max-width: 48rem;
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

    .save-row {
      display: flex;
      justify-content: flex-end;
      gap: 0.4rem;
      margin-top: 0.5rem;
    }

    .report-list {
      display: grid;
      gap: 0.6rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .report-item wa-card::part(base) {
      padding: 0.7rem 0.85rem;
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
  }

  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    super.disconnectedCallback();
  }

  override render() {
    const view = this.#currentView();
    if (view === null) {
      return html`
        <div class="card empty-card">
          Select a room from the sidebar, or create a new one.
        </div>
      `;
    }
    return html`
      ${this.#renderHeader(view.room)} ${this.#renderTabs()}
      <div class="panel card">${this.#renderActiveTab(view)}</div>
    `;
  }

  #renderHeader(room: Room) {
    const paused = room.status === "paused";
    return html`
      <header class="room-header card">
        <span class="room-name">${room.name}</span>
        <span class="room-topic">- ${room.topic}</span>
        <wa-badge variant="${badgeVariant(room.status)}" size="small">
          ${room.status}
        </wa-badge>
        <div class="room-actions">
          ${paused
            ? html`
              <wa-button size="small" variant="brand" @click="${(): Promise<
                void
              > => this.store.resumeRoom(room.id)}">Resume</wa-button>
            `
            : html`
              <wa-button size="small" variant="neutral" @click="${(): Promise<
                void
              > => this.store.pauseRoom(room.id)}">Pause</wa-button>
            `}
          <wa-button size="small" variant="danger" @click="${(): Promise<
            void
          > => this.#confirmDelete(room.id)}"
          >Delete</wa-button>
        </div>
      </header>
    `;
  }

  #renderTabs() {
    const tabs: Tab[] = ["stream", "settings", "reports"];
    return html`
      <div class="tab-bar card">
        ${tabs.map((tab) =>
          html`
            <button
              class="tab-btn ${this.activeTab === tab ? "is-active" : ""}"
              @click="${(): void => this.#selectTab(tab)}"
            >
              ${tabLabel(tab)}
            </button>
          `
        )}
      </div>
    `;
  }

  #renderActiveTab(view: RoomView) {
    switch (this.activeTab) {
      case "stream":
        return this.#renderStream(view);
      case "settings":
        return this.#renderSettings(view);
      case "reports":
        return this.#renderReports(view);
    }
  }

  #renderStream(view: RoomView) {
    if (view.turns.length === 0) {
      return html`
        <p class="empty">No turns yet.</p>
      `;
    }
    return html`
      <ul class="turn-list">
        ${view.turns.map((turn) =>
          this.#renderTurn(
            turn,
            view.toolCalls.filter((call) => call.turnId === turn.turnId),
          )
        )}
      </ul>
    `;
  }

  #renderTurn(turn: TurnBuffer, toolCalls: ToolCallEntry[]) {
    const classes = [
      "turn-item",
      turn.kind === "leader_note" ? "turn-leader" : "",
      turn.status === "streaming" ? "turn-streaming" : "",
      turn.status === "failed" ? "turn-failed" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return html`
      <li class="${classes}">
        <wa-card>
          <div class="turn-meta">
            <strong>${turn.agent}</strong>
            <span>- ${turn.kind === "leader_note"
              ? "leader note"
              : "chat"}</span>
            ${turn.timestamp
              ? html`
                <span>- ${formatTimestamp(turn.timestamp)}</span>
              `
              : ""} ${turn.status === "streaming"
              ? html`
                <wa-badge size="small" variant="warning">streaming</wa-badge>
              `
              : ""} ${turn.status === "failed"
              ? html`
                <wa-badge size="small" variant="danger">failed</wa-badge>
              `
              : ""}
          </div>
          ${renderMarkdown(turn.content || "...")}
          ${toolCalls.length > 0 ? this.#renderTurnToolCalls(toolCalls) : ""}
          ${turn.error
            ? html`
              <p class="tool-output">${turn.error}</p>
            `
            : ""}
        </wa-card>
      </li>
    `;
  }

  #renderTurnToolCalls(toolCalls: ToolCallEntry[]) {
    return html`
      <ul class="tool-list">
        ${toolCalls.map((call) =>
          html`
            <li>
              <div class="tool-meta">
                <strong>${call.tool}</strong>
                ${call.status === "running"
                  ? html`
                    <wa-badge size="small" variant="warning">running</wa-badge>
                  `
                  : call.status === "ok"
                  ? html`
                    <wa-badge size="small" variant="success">ok</wa-badge>
                  `
                  : html`
                    <wa-badge size="small" variant="danger">error</wa-badge>
                  `} ${call.durationMs !== null
                  ? html`
                    <span>${call.durationMs} ms</span>
                  `
                  : ""}
              </div>
              ${call.argsPreview !== ""
                ? html`
                  <pre class="tool-args">${call.argsPreview}</pre>
                `
                : ""} ${call.outputPreview !== null
                ? html`
                  <pre class="tool-output">${call.outputPreview}</pre>
                `
                : ""}
            </li>
          `
        )}
      </ul>
    `;
  }

  #renderSettings(view: RoomView) {
    if (
      this.settingsForm === null || this.settingsRoomId !== view.room.id
    ) {
      this.settingsForm = formFromRoom(view.room);
      this.settingsRoomId = view.room.id;
    }
    const form = this.settingsForm;
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
        <div class="save-row">
          <wa-button size="small" variant="neutral" @click="${(): void =>
            this.#resetForm(view.room)}"
          >Reset</wa-button>
          <wa-button size="small" variant="brand" @click="${(): Promise<void> =>
            this.#saveSettings(view.room.id)}"
          >Save</wa-button>
        </div>
      </div>
    `;
  }

  #renderReports(view: RoomView) {
    if (view.reports.length === 0) {
      return html`
        <p class="empty">No reports yet.</p>
      `;
    }
    const sorted = [...view.reports].sort((a, b) => b.sequence - a.sequence);
    return html`
      <ul class="report-list">
        ${sorted.map((report) =>
          html`
            <li class="report-item">
              <wa-card>
                <div class="turn-meta">
                  <strong>Report #${report.sequence}</strong>
                  ${report.status === "streaming"
                    ? html`
                      <wa-badge size="small" variant="warning">streaming</wa-badge>
                    `
                    : report.status === "failed"
                    ? html`
                      <wa-badge size="small" variant="danger">failed</wa-badge>
                    `
                    : html`
                      <wa-badge size="small" variant="success">done</wa-badge>
                    `} ${report.completedAt
                    ? html`
                      <span>- ${formatTimestamp(report.completedAt)}</span>
                    `
                    : ""}
                </div>
                ${renderMarkdown(report.content || "...")}
              </wa-card>
            </li>
          `
        )}
      </ul>
    `;
  }

  // -- Form helpers -------------------------------------------------------

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
    return html`
      <fieldset class="tier">
        <legend>${label}</legend>
        <label class="form-field">
          <span class="form-label">Provider</span>
          <wa-select size="small" .value="${config.provider}" @change="${(
            e: Event,
          ): void => {
            const value = readInputValue(e.target);
            if (value === "openrouter" || value === "openai_compat") {
              onChange({ ...config, provider: value as ProviderKind });
            }
          }}">
            <wa-option value="openrouter">OpenRouter</wa-option>
            <wa-option value="openai_compat"
            >OpenAI-compat (Ollama, vLLM, ...)</wa-option>
          </wa-select>
        </label>
        ${this.#renderTextField(
          "Model",
          config.model,
          (model) => onChange({ ...config, model }),
        )} ${this.#renderTextField(
          "Base URL",
          config.baseUrl ?? "",
          (value) =>
            onChange({ ...config, baseUrl: value === "" ? null : value }),
        )} ${this.#renderTextField(
          "API key",
          config.apiKey ?? "",
          (value) =>
            onChange({ ...config, apiKey: value === "" ? null : value }),
        )}
      </fieldset>
    `;
  }

  // -- Actions ------------------------------------------------------------

  #selectTab(tab: Tab): void {
    this.activeTab = tab;
  }

  async #saveSettings(roomId: string): Promise<void> {
    if (this.settingsForm === null) {
      return;
    }
    const form = this.settingsForm;
    const request: UpdateRoomRequest = {
      topic: form.topic,
      goal: form.goal,
      instruction: form.instruction === "" ? null : form.instruction,
      background: form.background === "" ? null : form.background,
      chatIntervalSeconds: form.chatIntervalSeconds,
      evaluationIntervalSeconds: form.evaluationIntervalSeconds,
      reportIntervalSeconds: form.reportIntervalSeconds,
      pythonTimeoutSeconds: form.pythonTimeoutSeconds,
      pythonFeedbackEvery: form.pythonFeedbackEvery,
      low: form.low,
      high: form.high,
    };
    await this.store.updateRoom(roomId, request);
  }

  async #confirmDelete(roomId: string): Promise<void> {
    const ok = globalThis.confirm("Delete this room? This cannot be undone.");
    if (ok) {
      await this.store.deleteRoom(roomId);
    }
  }

  #patchForm(patch: Partial<SettingsForm>): void {
    if (this.settingsForm === null) {
      return;
    }
    this.settingsForm = { ...this.settingsForm, ...patch };
  }

  #resetForm(room: Room): void {
    this.settingsForm = formFromRoom(room);
    this.settingsRoomId = room.id;
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

  #currentView(): RoomView | null {
    const state = this.dashboardState;
    if (state === null || state.currentRoomId === null) {
      return null;
    }
    return state.views[state.currentRoomId] ?? null;
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

function tabLabel(tab: Tab): string {
  switch (tab) {
    case "stream":
      return "Stream";
    case "settings":
      return "Settings";
    case "reports":
      return "Reports";
  }
}

function badgeVariant(status: Room["status"]): string {
  switch (status) {
    case "active":
      return "brand";
    case "paused":
      return "neutral";
    case "failed":
      return "danger";
  }
}
