import { dashboardContext } from "@/app/context";
import type { DashboardStore } from "@/app/state";
import type {
  DashboardState,
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
  intervalMinutes: number;
  turns: number;
  autorun: boolean;
}

const EMPTY_SETTINGS: RunSettingsForm = {
  topic: "",
  goal: "",
  instruction: "",
  background: "",
  intervalMinutes: 0,
  turns: 1,
  autorun: false,
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
  private accessor settings: RunSettingsForm = { ...EMPTY_SETTINGS };

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
      border-bottom: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      flex-shrink: 0;
      background: var(--wa-color-surface-default);
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

    /* -- Tab group fills remaining height -- */
    .tabs-wrap {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    wa-tab-group {
      flex: 1;
      min-height: 0;
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

    wa-tab-panel {
      height: 100%;
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
      grid-template-rows: 1fr;
      height: 100%;
      overflow: hidden;
    }

    .room-sidebar {
      display: flex;
      flex-direction: column;
      border-inline-end: var(--wa-border-width-s) solid
        var(--wa-color-border-normal);
      overflow: hidden;
      background: var(--wa-color-surface-default);
    }

    .sidebar-label {
      padding: 0.7rem 1rem 0.5rem;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--wa-color-text-quiet);
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

    .no-rooms {
      padding: 2rem 1rem;
      text-align: center;
      color: var(--wa-color-text-quiet);
      font-size: 0.875rem;
    }

    /* -- Room content -- */
    .room-content {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--wa-color-surface-sunken);
    }

    .content-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 1.25rem;
      display: grid;
      gap: 1.25rem;
      align-content: start;
    }

    .section-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--wa-color-text-quiet);
      margin: 0 0 0.5rem;
    }

    .event-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.5rem;
    }

    .event-item wa-card::part(base) {
      padding: 0.6rem 0.75rem;
    }

    .event-item.is-final-report wa-card::part(base) {
      border-color: var(--wa-color-brand-border-normal);
      background: var(--wa-color-brand-fill-quiet);
    }

    .event-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.72rem;
      color: var(--wa-color-text-quiet);
      margin-bottom: 0.3rem;
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
      color: var(--wa-color-text-quiet);
      font-size: 0.875rem;
    }

    .agents-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
      gap: 0.75rem;
    }

    .agent-card-name {
      margin: 0 0 0.35rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--wa-color-brand);
    }

    .agent-card-last {
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
      background: var(--wa-color-surface-sunken);
    }

    .field {
      display: grid;
      gap: 0.3rem;
    }

    .field-label {
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--wa-color-text-quiet);
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

    .card-fields {
      display: grid;
      gap: 0.875rem;
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
      border: var(--wa-border-width-s) solid var(--wa-color-brand-border-normal);
      background: var(--wa-color-brand-fill-quiet);
      font-size: 0.875rem;
      color: var(--wa-color-brand-on-quiet);
    }

    @media (max-width: 900px) {
      .debates-layout {
        grid-template-columns: 1fr;
        grid-template-rows: 12rem 1fr;
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
              ${this.#renderSettingsMessage()} ${this.#renderSettingsCard()}
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
    if (!this.dashboardState?.runs.length) {
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
    const st = this.dashboardState;
    if (st === null) {
      return html`

      `;
    }

    return html`
      <div class="content-body">
        <div>
          <p class="section-label">Events</p>
          ${this.#renderEvents(st)}
        </div>
        <div>
          <p class="section-label">Agent Snapshot</p>
          <div class="agents-grid">${this.#renderAgents(st)}</div>
        </div>
      </div>
    `;
  }

  #renderEvents(st: DashboardState) {
    if (st.events.length === 0) {
      return html`
        <p class="no-events">No events yet.</p>
      `;
    }

    return html`
      <ul class="event-list">
        ${st.events.map(
          (event) =>
            html`
              <li class="event-item ${event.eventType === "final_report"
                ? "is-final-report"
                : ""}">
                <wa-card>
                  <div class="event-meta">
                    <span>${event.agent ?? "None"}</span>
                    <span>${formatTimestamp(event.timestamp)}</span>
                  </div>
                  <p class="event-text">${event.content}</p>
                </wa-card>
              </li>
            `,
        )}
      </ul>
    `;
  }

  #renderAgents(st: DashboardState) {
    const latestByAgent = new Map<string, string>();
    for (const event of st.events) {
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
          <wa-card>
            <h3 class="agent-card-name">${name}</h3>
            <p class="agent-card-last">
              ${latestByAgent.get(name) ?? "No update yet."}
            </p>
          </wa-card>
        `,
    );
  }

  #renderSettingsCard() {
    const s = this.settings;
    const busy = this.dashboardState?.isStartingRun ?? false;

    return html`
      <wa-card style="max-width: 48rem;">
        <div slot="header">Debate Settings</div>
        <div class="card-fields">
          <label class="field">
            <span class="field-label">Topic</span>
            <wa-input
              size="small"
              .value="${s.topic}"
              @input="${(e: InputEvent): void => this.#onTextField("topic", e)}"
            ></wa-input>
          </label>

          <label class="field">
            <span class="field-label">Goal</span>
            <wa-input
              size="small"
              .value="${s.goal}"
              @input="${(e: InputEvent): void => this.#onTextField("goal", e)}"
            ></wa-input>
          </label>

          <label class="field">
            <span class="field-label">Instruction</span>
            <wa-textarea
              size="small"
              rows="3"
              .value="${s.instruction}"
              @input="${(e: InputEvent): void =>
                this.#onTextField("instruction", e)}"
            ></wa-textarea>
          </label>

          <label class="field">
            <span class="field-label">Background</span>
            <wa-textarea
              size="small"
              rows="3"
              .value="${s.background}"
              @input="${(e: InputEvent): void =>
                this.#onTextField("background", e)}"
            ></wa-textarea>
          </label>

          <div class="numeric-row">
            <label class="field">
              <span class="field-label">Interval (minutes)</span>
              <wa-input
                type="number"
                size="small"
                min="0"
                .value="${String(s.intervalMinutes)}"
                @input="${(e: InputEvent): void =>
                  this.#onNumberField("intervalMinutes", e, 0)}"
              ></wa-input>
            </label>

            <label class="field">
              <span class="field-label">Turns</span>
              <wa-input
                type="number"
                size="small"
                min="1"
                .value="${String(s.turns)}"
                @input="${(e: InputEvent): void =>
                  this.#onNumberField("turns", e, 1)}"
              ></wa-input>
            </label>
          </div>

          <div class="toggle-row">
            <wa-checkbox
              .checked="${s.autorun}"
              @change="${(e: Event): void => this.#onAutorun(e)}"
            >
              Autorun
            </wa-checkbox>
          </div>
        </div>

        <div slot="footer" class="card-actions">
          <wa-button
            size="small"
            variant="neutral"
            ?disabled="${busy}"
            @click="${(): Promise<void> => this.#saveSettings()}"
          >
            Save Settings
          </wa-button>
          <wa-button
            size="small"
            variant="brand"
            ?disabled="${busy}"
            @click="${this.#onStartDebate}"
          >
            Start Debate
          </wa-button>
        </div>
      </wa-card>
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
      const all = await this.store.loadSettings();
      const s = all.find((x) => x.kind === "discussion");
      if (s) {
        this.settings = {
          topic: s.topic,
          goal: s.goal,
          instruction: s.instruction,
          background: s.background,
          intervalMinutes: s.intervalMinutes,
          turns: s.turns,
          autorun: s.autorun,
        };
      }
    } catch {
      this.settingsMessage = "Could not load saved settings.";
    }
  }

  #onTextField(
    field: "topic" | "goal" | "instruction" | "background",
    event: InputEvent,
  ): void {
    const value = readInputValue(event.target);
    if (value === null) {
      return;
    }
    this.settings = { ...this.settings, [field]: value };
  }

  #onNumberField(
    field: "intervalMinutes" | "turns",
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
    this.settings = { ...this.settings, [field]: value };
  }

  #onAutorun(event: Event): void {
    const checked = readChecked(event.target);
    if (checked === null) {
      return;
    }
    this.settings = { ...this.settings, autorun: checked };
  }

  async #saveSettings(): Promise<void> {
    try {
      await this.store.saveSettings(this.#toSaveRequest());
      this.settingsMessage = "Settings saved.";
    } catch {
      this.settingsMessage = "Failed to save settings.";
    }
  }

  #onStartDebate = (): void => {
    void this.store.startRun(this.#toStartRequest());
  };

  #toSaveRequest(): SaveRunSettingsRequest {
    return {
      topic: this.settings.topic,
      goal: this.settings.goal,
      instruction: this.settings.instruction,
      background: this.settings.background,
      intervalMinutes: this.settings.intervalMinutes,
      turns: this.settings.turns,
      autorun: this.settings.autorun,
    };
  }

  #toStartRequest(): StartRunRequest {
    return {
      topic: this.settings.topic,
      goal: this.settings.goal,
      instruction: this.settings.instruction,
      background: this.settings.background,
      intervalSeconds: this.settings.intervalMinutes * 60,
      rounds: this.settings.turns,
      runForever: this.settings.autorun,
    };
  }

  #roomLabel(run: RunRecord | null): string {
    if (run === null) {
      return "Select a room";
    }
    const tag = new Date(run.createdAt).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Debate - ${tag}`;
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
