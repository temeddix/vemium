import { dashboardContext } from "@/app/context";
import type { DashboardStore } from "@/app/state";
import type {
  DashboardState,
  RunKind,
  RunRecord,
  SaveRunSettingsRequest,
  StartRunRequest,
} from "@/app/types";
import { formatTimestamp } from "@/app/utils";
import { consume } from "@lit/context";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface RunSettingsForm {
  topic: string;
  goal: string;
  instruction: string;
  background: string;
  intervalSeconds: number;
  durationMinutes: number;
  runForever: boolean;
}

interface LaunchSettings {
  discussion: RunSettingsForm;
  weeklyReport: RunSettingsForm;
}

const EMPTY_SETTINGS: RunSettingsForm = {
  topic: "",
  goal: "",
  instruction: "",
  background: "",
  intervalSeconds: 0,
  durationMinutes: 1,
  runForever: false,
};

function readInputValue(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  if (!("value" in target)) {
    return null;
  }
  const val = (target as Record<string, unknown>)["value"];
  return typeof val === "string" ? val : null;
}

function readChecked(target: EventTarget | null): boolean | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  if (!("checked" in target)) {
    return null;
  }
  const val = (target as Record<string, unknown>)["checked"];
  return typeof val === "boolean" ? val : null;
}

declare global {
  interface HTMLElementTagNameMap {
    "te-dashboard-view": DashboardView;
  }
}

@customElement("te-dashboard-view")
export class DashboardView extends LitElement {
  @consume({ context: dashboardContext, subscribe: true })
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor dashboardState: DashboardState | null = null;

  @state()
  private accessor launchSettings: LaunchSettings = {
    discussion: { ...EMPTY_SETTINGS },
    weeklyReport: { ...EMPTY_SETTINGS },
  };

  @state()
  private accessor settingsMessage: string | null = null;

  #unsubscribe: (() => void) | null = null;

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* -- Header -- */
    .app-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1.25rem;
      border-bottom: 1px solid var(--wa-color-neutral-200);
      flex-shrink: 0;
    }

    .app-logo {
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    .app-tagline {
      font-size: 0.8rem;
      color: var(--wa-color-neutral-600);
    }

    .ws-status {
      margin-left: auto;
    }

    /* -- Tab group fills remaining height -- */
    .tabs-wrap {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    wa-tab-group {
      height: 100%;
    }

    wa-tab-group::part(base) {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    wa-tab-group::part(body) {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    wa-tab-panel::part(base) {
      height: 100%;
      padding: 0;
      overflow: hidden;
    }

    /* -- Debates tab -- */
    .debates-layout {
      display: grid;
      grid-template-columns: 22rem 1fr;
      height: 100%;
      overflow: hidden;
    }

    .room-sidebar {
      display: flex;
      flex-direction: column;
      border-inline-end: 1px solid var(--wa-color-neutral-200);
      overflow: hidden;
    }

    .sidebar-label {
      padding: 0.7rem 1rem 0.5rem;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--wa-color-neutral-500);
      flex-shrink: 0;
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
      border: 1px solid transparent;
      border-radius: 0.5rem;
      padding: 0.55rem 0.75rem;
      cursor: pointer;
      display: grid;
      gap: 0.2rem;
      font: inherit;
      color: inherit;
    }

    .room-btn:hover {
      background: var(--wa-color-neutral-100);
    }

    .room-btn.is-active {
      background: var(--wa-color-primary-50);
      border-color: var(--wa-color-primary-300);
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
      color: var(--wa-color-neutral-500);
    }

    .no-rooms {
      padding: 2rem 1rem;
      text-align: center;
      color: var(--wa-color-neutral-500);
      font-size: 0.875rem;
    }

    /* -- Room content -- */
    .room-content {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .content-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.65rem 1.25rem;
      border-bottom: 1px solid var(--wa-color-neutral-200);
      flex-shrink: 0;
    }

    .content-title {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .content-body {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 1.25rem;
      display: grid;
      gap: 1.25rem;
      align-content: start;
    }

    .section-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--wa-color-neutral-500);
      margin: 0 0 0.5rem;
    }

    .event-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.5rem;
    }

    .event-item {
      border: 1px solid var(--wa-color-neutral-200);
      border-radius: 0.5rem;
      padding: 0.6rem 0.75rem;
    }

    .event-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: var(--wa-color-neutral-500);
      margin-bottom: 0.25rem;
    }

    .event-text {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .no-events {
      padding: 2rem;
      text-align: center;
      color: var(--wa-color-neutral-500);
      font-size: 0.875rem;
    }

    .agents-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
      gap: 0.75rem;
    }

    .agent-card {
      border: 1px solid var(--wa-color-neutral-200);
      border-radius: 0.5rem;
      padding: 0.75rem;
    }

    .agent-name {
      margin: 0 0 0.35rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--wa-color-primary-600);
    }

    .agent-last {
      margin: 0;
      font-size: 0.825rem;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    /* -- Settings tab -- */
    .settings-body {
      height: 100%;
      overflow-y: auto;
      padding: 1.5rem;
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.5rem;
    }

    .settings-card {
      border: 1px solid var(--wa-color-neutral-200);
      border-radius: 0.75rem;
      padding: 1.25rem;
      display: grid;
      gap: 0.875rem;
    }

    .settings-card-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
    }

    .field {
      display: grid;
      gap: 0.3rem;
    }

    .field-label {
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--wa-color-neutral-600);
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .numeric-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .round-hint {
      margin: 0;
      font-size: 0.72rem;
      color: var(--wa-color-neutral-500);
    }

    .card-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .message-banner {
      margin-bottom: 1rem;
      padding: 0.6rem 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid var(--wa-color-primary-300);
      background: var(--wa-color-primary-50);
      font-size: 0.875rem;
      color: var(--wa-color-primary-700);
    }

    @media (max-width: 900px) {
      .debates-layout {
        grid-template-columns: 1fr;
        grid-template-rows: 12rem 1fr;
      }

      .settings-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#bindStore();
    void this.#loadSettingsFromBackend();
  }

  override updated(changedProperties: Map<string, unknown>): void {
    if (changedProperties.has("store")) {
      this.#unsubscribe?.();
      this.#unsubscribe = null;
      this.#bindStore();
      void this.#loadSettingsFromBackend();
    }
  }

  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    super.disconnectedCallback();
  }

  override render() {
    return html`
      <header class="app-header">
        <span class="app-logo">Vemium</span>
        <span class="app-tagline">Debating Agents</span>
        <span class="ws-status">${this.#renderWsStatus()}</span>
      </header>

      <div class="tabs-wrap">
        <wa-tab-group placement="bottom">
          <wa-tab slot="nav" panel="debates">Debates</wa-tab>
          <wa-tab slot="nav" panel="settings">Settings</wa-tab>

          <wa-tab-panel name="debates">
            <div class="debates-layout">
              <aside class="room-sidebar">
                <div class="sidebar-label">Rooms</div>
                ${this.#renderRoomList()}
              </aside>
              <section class="room-content">
                ${this.#renderRoomDetail()}
              </section>
            </div>
          </wa-tab-panel>

          <wa-tab-panel name="settings">
            <div class="settings-body">
              ${this.#renderSettingsMessage()}
              <div class="settings-grid">
                ${this.#renderSettingsCard("discussion")} ${this
                  .#renderSettingsCard("weekly_report")}
              </div>
            </div>
          </wa-tab-panel>
        </wa-tab-group>
      </div>
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

  #renderSettingsMessage() {
    if (this.settingsMessage === null) {
      return html`

      `;
    }
    return html`
      <div class="message-banner">${this.settingsMessage}</div>
    `;
  }

  #renderRoomList() {
    if (
      this.dashboardState === null ||
      this.dashboardState.runs.length === 0
    ) {
      return html`
        <p class="no-rooms">No rooms yet.<br />Start one in Settings.</p>
      `;
    }

    return html`
      <ul class="room-list">
        ${this.dashboardState.runs.map((run) => {
          const isActive = this.dashboardState?.activeRun?.id === run.id;
          return html`
            <li>
              <button
                class="room-btn ${isActive ? "is-active" : ""}"
                @click="${(): void => this.store.selectRun(run.id)}"
              >
                <span class="room-title">${this.#roomLabel(run)}</span>
                <span class="room-meta">
                  <span class="room-time">${formatTimestamp(
                    run.createdAt,
                  )}</span>
                  <wa-badge variant="${this.#statusVariant(
                    run.status,
                  )}" size="small">
                    ${run.status}
                  </wa-badge>
                </span>
              </button>
            </li>
          `;
        })}
      </ul>
    `;
  }

  #renderRoomDetail() {
    const state = this.dashboardState;
    if (state === null) {
      return html`

      `;
    }

    return html`
      <div class="content-header">
        <h2 class="content-title">${this.#roomLabel(state.activeRun)}</h2>
      </div>
      <div class="content-body">
        <div>
          <p class="section-label">Events</p>
          ${this.#renderEvents(state)}
        </div>
        <div>
          <p class="section-label">Agent Snapshot</p>
          <div class="agents-grid">${this.#renderAgents(state)}</div>
        </div>
      </div>
    `;
  }

  #renderEvents(state: DashboardState) {
    if (state.events.length === 0) {
      return html`
        <p class="no-events">No events yet.</p>
      `;
    }

    return html`
      <ul class="event-list">
        ${state.events.map(
          (event) =>
            html`
              <li class="event-item">
                <div class="event-meta">
                  <span>${event.eventType}${event.agent
                    ? ` - ${event.agent}`
                    : ""}</span>
                  <span>${formatTimestamp(event.timestamp)}</span>
                </div>
                <p class="event-text">${event.content}</p>
              </li>
            `,
        )}
      </ul>
    `;
  }

  #renderAgents(state: DashboardState) {
    const latestByAgent = new Map<string, string>();
    for (const event of state.events) {
      if (event.agent !== null) {
        latestByAgent.set(event.agent, event.content);
      }
    }

    const agentNames = [
      "DataScavenger",
      "MacroStrategist",
      "QuantEngineer",
      "ComplianceLawyer",
      "ChiefEditor",
    ];

    return agentNames.map(
      (name) =>
        html`
          <article class="agent-card">
            <h3 class="agent-name">${name}</h3>
            <p class="agent-last">
              ${latestByAgent.get(name) ?? "No update yet."}
            </p>
          </article>
        `,
    );
  }

  #renderSettingsCard(kind: RunKind) {
    const key = kind === "discussion" ? "discussion" : "weeklyReport";
    const settings = this.launchSettings[key];
    const rounds = this.#calculateRounds(settings);
    const busy = this.dashboardState?.isStartingRun ?? false;

    return html`
      <section class="settings-card">
        <h3 class="settings-card-title">
          ${kind === "discussion"
            ? "Debate Settings"
            : "Weekly Report Settings"}
        </h3>

        <label class="field">
          <span class="field-label">Topic</span>
          <wa-input
            size="small"
            .value="${settings.topic}"
            @input="${(e: InputEvent): void =>
              this.#onTextField(key, "topic", e)}"
          ></wa-input>
        </label>

        <label class="field">
          <span class="field-label">Goal</span>
          <wa-input
            size="small"
            .value="${settings.goal}"
            @input="${(e: InputEvent): void =>
              this.#onTextField(key, "goal", e)}"
          ></wa-input>
        </label>

        <label class="field">
          <span class="field-label">Instruction</span>
          <wa-textarea
            size="small"
            rows="3"
            .value="${settings.instruction}"
            @input="${(e: InputEvent): void =>
              this.#onTextField(key, "instruction", e)}"
          ></wa-textarea>
        </label>

        <label class="field">
          <span class="field-label">Background</span>
          <wa-textarea
            size="small"
            rows="3"
            .value="${settings.background}"
            @input="${(e: InputEvent): void =>
              this.#onTextField(key, "background", e)}"
          ></wa-textarea>
        </label>

        <div class="toggle-row">
          <wa-checkbox
            .checked="${settings.runForever}"
            @change="${(e: Event): void => this.#onForever(key, e)}"
          >
            Run forever in background
          </wa-checkbox>
        </div>

        <div class="numeric-row">
          <label class="field">
            <span class="field-label">Interval (seconds)</span>
            <wa-input
              type="number"
              size="small"
              min="0"
              .value="${String(settings.intervalSeconds)}"
              @input="${(e: InputEvent): void =>
                this.#onNumberField(key, "intervalSeconds", e, 0)}"
            ></wa-input>
          </label>

          <label class="field">
            <span class="field-label">Duration (minutes)</span>
            <wa-input
              type="number"
              size="small"
              min="1"
              .value="${String(settings.durationMinutes)}"
              @input="${(e: InputEvent): void =>
                this.#onNumberField(key, "durationMinutes", e, 1)}"
            ></wa-input>
          </label>
        </div>

        <p class="round-hint">
          ${settings.runForever
            ? "Mode: infinite loop"
            : `Derived rounds: ${rounds}`}
        </p>

        <div class="card-actions">
          <wa-button
            size="small"
            variant="neutral"
            ?disabled="${busy}"
            @click="${(): Promise<void> => this.#saveSettings(kind)}"
          >
            Save Settings
          </wa-button>
          <wa-button
            size="small"
            variant="brand"
            ?disabled="${busy}"
            @click="${kind === "discussion"
              ? this.#onStartDiscussion
              : this.#onStartWeeklyReport}"
          >
            ${kind === "discussion" ? "Start Debate" : "Start Report"}
          </wa-button>
        </div>
      </section>
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

  async #loadSettingsFromBackend(): Promise<void> {
    try {
      const settings = await this.store.loadSettings();
      for (const setting of settings) {
        const key = setting.kind === "discussion"
          ? "discussion"
          : "weeklyReport";
        this.launchSettings = {
          ...this.launchSettings,
          [key]: {
            topic: setting.topic,
            goal: setting.goal,
            instruction: setting.instruction,
            background: setting.background,
            intervalSeconds: setting.intervalSeconds,
            durationMinutes: setting.durationMinutes,
            runForever: setting.runForever,
          },
        };
      }
    } catch {
      this.settingsMessage = "Could not load saved settings.";
    }
  }

  #onTextField(
    key: "discussion" | "weeklyReport",
    field: "topic" | "goal" | "instruction" | "background",
    event: InputEvent,
  ): void {
    const value = readInputValue(event.target);
    if (value === null) {
      return;
    }
    this.launchSettings = {
      ...this.launchSettings,
      [key]: { ...this.launchSettings[key], [field]: value },
    };
  }

  #onNumberField(
    key: "discussion" | "weeklyReport",
    field: "intervalSeconds" | "durationMinutes",
    event: InputEvent,
    minValue: number,
  ): void {
    const raw = readInputValue(event.target);
    if (raw === null) {
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    const value = Number.isFinite(parsed)
      ? Math.max(minValue, parsed)
      : minValue;
    this.launchSettings = {
      ...this.launchSettings,
      [key]: { ...this.launchSettings[key], [field]: value },
    };
  }

  #onForever(key: "discussion" | "weeklyReport", event: Event): void {
    const checked = readChecked(event.target);
    if (checked === null) {
      return;
    }
    this.launchSettings = {
      ...this.launchSettings,
      [key]: { ...this.launchSettings[key], runForever: checked },
    };
  }

  #calculateRounds(settings: RunSettingsForm): number {
    if (settings.runForever) {
      return 1;
    }
    const durationSeconds = Math.max(60, settings.durationMinutes * 60);
    if (settings.intervalSeconds <= 0) {
      return 1;
    }
    return Math.max(
      1,
      Math.min(24, Math.round(durationSeconds / settings.intervalSeconds)),
    );
  }

  #toSaveRequest(settings: RunSettingsForm): SaveRunSettingsRequest {
    return {
      topic: settings.topic,
      goal: settings.goal,
      instruction: settings.instruction,
      background: settings.background,
      intervalSeconds: settings.intervalSeconds,
      durationMinutes: settings.durationMinutes,
      runForever: settings.runForever,
    };
  }

  #toStartRequest(settings: RunSettingsForm): StartRunRequest {
    return {
      topic: settings.topic,
      goal: settings.goal,
      instruction: settings.instruction,
      background: settings.background,
      intervalSeconds: settings.intervalSeconds,
      rounds: this.#calculateRounds(settings),
      runForever: settings.runForever,
    };
  }

  async #saveSettings(kind: RunKind): Promise<void> {
    const key = kind === "discussion" ? "discussion" : "weeklyReport";
    try {
      await this.store.saveSettings(
        kind,
        this.#toSaveRequest(this.launchSettings[key]),
      );
      this.settingsMessage = `${
        kind === "discussion" ? "Debate" : "Report"
      } settings saved.`;
    } catch {
      this.settingsMessage = "Failed to save settings.";
    }
  }

  #onStartDiscussion = (): void => {
    void this.store.startRun(
      "discussion",
      this.#toStartRequest(this.launchSettings.discussion),
    );
  };

  #onStartWeeklyReport = (): void => {
    void this.store.startRun(
      "weekly_report",
      this.#toStartRequest(this.launchSettings.weeklyReport),
    );
  };

  #roomLabel(run: RunRecord | null): string {
    if (run === null) {
      return "Select a room";
    }
    const kindLabel = run.kind === "discussion" ? "Debate" : "Report";
    const tag = new Date(run.createdAt).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${kindLabel} - ${tag}`;
  }

  #statusVariant(status: string): string {
    if (status === "running" || status === "queued") {
      return "brand";
    }
    if (status === "failed") {
      return "danger";
    }
    return "neutral";
  }
}
