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
      --surface-1: #0f172a;
      --surface-2: #15213a;
      --surface-3: #1e2d4f;
      --ink-high: #f9fafb;
      --ink-mid: #c8d1e4;
      --ink-low: #8ea0c9;
      --accent: #4fd1c5;
      --danger: #fc8181;
      display: block;
      min-height: 100vh;
      background:
        radial-gradient(
          circle at 20% 0%,
          rgba(79, 209, 197, 0.22),
          transparent 40%
        ),
        radial-gradient(
        circle at 85% 15%,
        rgba(135, 206, 250, 0.22),
        transparent 35%
      ),
        linear-gradient(160deg, #0b1222, #101a2f 35%, #0a1428 100%);
      color: var(--ink-high);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      padding: 1.5rem;
      box-sizing: border-box;
    }

    .layout {
      max-width: 86rem;
      margin: 0 auto;
      display: grid;
      gap: 1rem;
    }

    .hero {
      border: 1px solid rgba(143, 167, 208, 0.35);
      border-radius: 1rem;
      background: linear-gradient(
        130deg,
        rgba(24, 39, 67, 0.88),
        rgba(16, 30, 56, 0.88)
      );
      padding: 1.25rem;
      box-shadow: 0 18px 50px rgba(8, 12, 24, 0.45);
    }

    .title {
      margin: 0;
      font-size: 1.6rem;
      letter-spacing: 0.01em;
    }

    .subtitle {
      margin-top: 0.45rem;
      color: var(--ink-mid);
      font-size: 0.95rem;
    }

    .content {
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(0, 1.6fr) minmax(20rem, 1fr);
    }

    .panel {
      border: 1px solid rgba(143, 167, 208, 0.3);
      border-radius: 1rem;
      background: linear-gradient(
        165deg,
        rgba(24, 38, 63, 0.9),
        rgba(17, 28, 48, 0.9)
      );
      padding: 1rem;
    }

    .section-title {
      margin: 0 0 0.8rem;
      font-size: 1rem;
      color: var(--ink-mid);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
      margin-bottom: 0.9rem;
    }

    .settings-card {
      border: 1px solid rgba(143, 167, 208, 0.25);
      border-radius: 0.8rem;
      background: rgba(12, 21, 38, 0.78);
      padding: 0.75rem;
      display: grid;
      gap: 0.55rem;
    }

    .settings-title {
      margin: 0;
      font-size: 0.9rem;
      color: var(--ink-mid);
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .field {
      display: grid;
      gap: 0.25rem;
    }

    .field-label {
      color: var(--ink-low);
      font-size: 0.8rem;
      letter-spacing: 0.02em;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--ink-mid);
      margin-top: 0.15rem;
    }

    input,
    textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(143, 167, 208, 0.35);
      border-radius: 0.55rem;
      background: rgba(9, 16, 29, 0.9);
      color: var(--ink-high);
      padding: 0.45rem 0.55rem;
      font: inherit;
      font-size: 0.85rem;
      line-height: 1.35;
    }

    input[type="checkbox"] {
      width: auto;
      inline-size: 1rem;
      block-size: 1rem;
    }

    textarea {
      min-height: 4.2rem;
      resize: vertical;
    }

    .numeric-row {
      display: grid;
      gap: 0.45rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .duration-hint {
      color: var(--ink-low);
      font-size: 0.75rem;
      margin: 0;
    }

    .actions {
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
      margin-bottom: 0.75rem;
    }

    button {
      border: 1px solid rgba(143, 167, 208, 0.42);
      border-radius: 0.7rem;
      background: var(--surface-3);
      color: var(--ink-high);
      font-weight: 600;
      padding: 0.55rem 0.85rem;
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.45;
      cursor: wait;
    }

    .status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      border: 1px solid rgba(143, 167, 208, 0.24);
      background: var(--surface-2);
      border-radius: 0.8rem;
      padding: 0.7rem;
      margin-bottom: 0.9rem;
      font-size: 0.9rem;
      color: var(--ink-mid);
    }

    .chip {
      border-radius: 999px;
      padding: 0.2rem 0.6rem;
      border: 1px solid rgba(143, 167, 208, 0.32);
      color: var(--ink-high);
    }

    .chip.connected {
      border-color: rgba(79, 209, 197, 0.6);
      color: var(--accent);
    }

    .chip.disconnected {
      border-color: rgba(252, 129, 129, 0.6);
      color: var(--danger);
    }

    .event-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.55rem;
      max-height: 34rem;
      overflow: auto;
    }

    .event-item {
      border: 1px solid rgba(143, 167, 208, 0.22);
      border-radius: 0.75rem;
      background: rgba(14, 24, 42, 0.75);
      padding: 0.65rem;
    }

    .event-meta {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      color: var(--ink-low);
      font-size: 0.8rem;
      margin-bottom: 0.3rem;
    }

    .event-content {
      margin: 0;
      line-height: 1.38;
      color: var(--ink-high);
      font-size: 0.92rem;
      white-space: pre-wrap;
    }

    .rooms-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.5rem;
      max-height: 20rem;
      overflow: auto;
    }

    .room-item button {
      width: 100%;
      text-align: left;
      display: grid;
      gap: 0.2rem;
    }

    .room-name {
      font-size: 0.84rem;
      color: var(--ink-high);
      word-break: break-word;
    }

    .room-meta {
      font-size: 0.76rem;
      color: var(--ink-low);
      display: flex;
      justify-content: space-between;
      gap: 0.6rem;
    }

    .room-badge {
      border: 1px solid rgba(143, 167, 208, 0.45);
      border-radius: 999px;
      padding: 0.06rem 0.45rem;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--ink-mid);
    }

    .room-badge.running,
    .room-badge.queued {
      border-color: rgba(79, 209, 197, 0.7);
      color: var(--accent);
    }

    .room-badge.failed {
      border-color: rgba(252, 129, 129, 0.7);
      color: var(--danger);
    }

    .agents {
      display: grid;
      gap: 0.55rem;
      margin-top: 0.8rem;
    }

    .agent-card {
      border: 1px solid rgba(143, 167, 208, 0.2);
      border-radius: 0.75rem;
      padding: 0.65rem;
      background: rgba(11, 19, 34, 0.75);
    }

    .agent-name {
      margin: 0;
      font-size: 0.9rem;
      color: var(--ink-mid);
    }

    .agent-last {
      margin-top: 0.32rem;
      color: var(--ink-high);
      font-size: 0.88rem;
      line-height: 1.35;
      white-space: pre-wrap;
    }

    .message {
      border: 1px solid rgba(79, 209, 197, 0.35);
      color: #d4fff8;
      background: rgba(12, 70, 64, 0.35);
      border-radius: 0.6rem;
      padding: 0.55rem 0.65rem;
      font-size: 0.88rem;
      margin-top: 0.7rem;
    }

    .error {
      border: 1px solid rgba(252, 129, 129, 0.35);
      color: #ffd5d5;
      background: rgba(80, 24, 24, 0.45);
      border-radius: 0.6rem;
      padding: 0.55rem 0.65rem;
      font-size: 0.88rem;
      margin-top: 0.7rem;
    }

    @media (max-width: 1080px) {
      .settings-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 860px) {
      :host {
        padding: 1rem;
      }

      .content {
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
    if (this.dashboardState === null) {
      return html`

      `;
    }

    return this.#renderContent();
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
      this.settingsMessage = "Could not load saved settings from SQLite.";
    }
  }

  #renderContent() {
    if (this.dashboardState === null) {
      return html`

      `;
    }

    const wsClass = this.dashboardState.wsConnected
      ? "chip connected"
      : "chip disconnected";
    const wsText = this.dashboardState.wsConnected
      ? "WebSocket connected"
      : `WebSocket reconnecting #${this.dashboardState.reconnectAttempt}`;

    return html`
      <main class="layout">
        <section class="hero">
          <h1 class="title">Vemium Agent Console</h1>
          <p class="subtitle">
            Configure settings in this web UI and persist them to SQLite.
          </p>
        </section>

        <section class="content">
          <article class="panel">
            <h2 class="section-title">Live Debate & Report Controls</h2>
            <div class="settings-grid">
              ${this.#renderSettingsCard("discussion")} ${this
                .#renderSettingsCard("weekly_report")}
            </div>

            <div class="status">
              <span>
                Open room: ${this.#roomTitle(this.dashboardState.activeRun)}
              </span>
              <span class="${wsClass}">${wsText}</span>
            </div>

            <ul class="event-list">
              ${this.#renderEvents()}
            </ul>

            ${this.#renderMessage()} ${this.#renderError()}
          </article>

          <aside class="panel">
            <h2 class="section-title">Rooms</h2>
            <ul class="rooms-list">
              ${this.#renderRooms()}
            </ul>

            <h2 class="section-title" style="margin-top: 1rem">Agent Snapshot</h2>
            <div class="agents">
              ${this.#renderAgents()}
            </div>
          </aside>
        </section>
      </main>
    `;
  }

  #renderSettingsCard(kind: RunKind) {
    const key = kind === "discussion" ? "discussion" : "weeklyReport";
    const settings = this.launchSettings[key];
    const rounds = this.#calculateRounds(settings);

    return html`
      <section class="settings-card">
        <h3 class="settings-title">
          ${kind === "discussion"
            ? "Debate Settings"
            : "Weekly Report Settings"}
        </h3>

        <label class="field">
          <span class="field-label">Topic</span>
          <input
            .value="${settings.topic}"
            @input="${(event: InputEvent): void =>
              this.#updateTextField(key, "topic", event)}"
          />
        </label>

        <label class="field">
          <span class="field-label">Goal</span>
          <input
            .value="${settings.goal}"
            @input="${(event: InputEvent): void =>
              this.#updateTextField(key, "goal", event)}"
          />
        </label>

        <label class="field">
          <span class="field-label">Instruction</span>
          <textarea
            .value="${settings.instruction}"
            @input="${(event: InputEvent): void =>
              this.#updateTextField(key, "instruction", event)}"
          ></textarea>
        </label>

        <label class="field">
          <span class="field-label">Background</span>
          <textarea
            .value="${settings.background}"
            @input="${(event: InputEvent): void =>
              this.#updateTextField(key, "background", event)}"
          ></textarea>
        </label>

        <div class="toggle-row">
          <input
            type="checkbox"
            .checked="${settings.runForever}"
            @change="${(event: Event): void => this.#updateForever(key, event)}"
          />
          <span>Run forever in background</span>
        </div>

        <div class="numeric-row">
          <label class="field">
            <span class="field-label">Interval (seconds)</span>
            <input
              type="number"
              min="0"
              .value="${String(settings.intervalSeconds)}"
              @input="${(event: InputEvent): void =>
                this.#updateNumberField(key, "intervalSeconds", event, 0)}"
            />
          </label>

          <label class="field">
            <span class="field-label">Desired duration (minutes)</span>
            <input
              type="number"
              min="1"
              .value="${String(settings.durationMinutes)}"
              @input="${(event: InputEvent): void =>
                this.#updateNumberField(key, "durationMinutes", event, 1)}"
            />
          </label>
        </div>

        <p class="duration-hint">
          ${settings.runForever
            ? "Mode: infinite loop"
            : `Derived rounds: ${rounds}`}
        </p>

        <div class="actions">
          <button
            ?disabled="${this.dashboardState?.isStartingRun ?? false}"
            @click="${(): Promise<void> => this.#saveSettings(kind)}"
          >
            Save Settings
          </button>
          <button
            ?disabled="${this.dashboardState?.isStartingRun ?? false}"
            @click="${kind === "discussion"
              ? this.#onStartDiscussion
              : this.#onStartWeeklyReport}"
          >
            ${kind === "discussion" ? "Start Debate Room" : "Start Report Room"}
          </button>
        </div>
      </section>
    `;
  }

  #renderRooms() {
    if (this.dashboardState === null || this.dashboardState.runs.length === 0) {
      return html`
        <li class="event-item">
          <p class="event-content">No rooms yet. Start one from the controls panel.</p>
        </li>
      `;
    }

    return this.dashboardState.runs.map((run) => {
      const isSelected = this.dashboardState?.activeRun?.id === run.id;
      return html`
        <li class="room-item">
          <button
            style="${isSelected ? "border-color: var(--accent);" : ""}"
            @click="${(): void => this.store.selectRun(run.id)}"
          >
            <span class="room-name">${this.#roomTitle(run)}</span>
            <span class="room-meta">
              <span>${formatTimestamp(run.createdAt)}</span>
              <span class="room-badge ${run.status}">${run.status}</span>
            </span>
          </button>
        </li>
      `;
    });
  }

  #renderEvents() {
    if (
      this.dashboardState === null || this.dashboardState.events.length === 0
    ) {
      return html`
        <li class="event-item"><p class="event-content">No events yet.</p></li>
      `;
    }

    return this.dashboardState.events.map((event) => {
      return html`
        <li class="event-item">
          <div class="event-meta">
            <span>${event.eventType}</span>
            <span>${formatTimestamp(event.timestamp)}</span>
          </div>
          <p class="event-content">
            ${event.agent ? `${event.agent}: ` : ""}${event.content}
          </p>
        </li>
      `;
    });
  }

  #renderAgents() {
    if (this.dashboardState === null) {
      return html`

      `;
    }

    const latestByAgent = new Map<string, string>();
    for (const event of this.dashboardState.events) {
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

    return agentNames.map((agentName) => {
      const latest = latestByAgent.get(agentName) ?? "No update yet.";
      return html`
        <article class="agent-card">
          <h3 class="agent-name">${agentName}</h3>
          <p class="agent-last">${latest}</p>
        </article>
      `;
    });
  }

  #renderError() {
    if (
      this.dashboardState === null || this.dashboardState.errorMessage === null
    ) {
      return html`

      `;
    }

    return html`
      <div class="error">${this.dashboardState.errorMessage}</div>
    `;
  }

  #renderMessage() {
    if (this.settingsMessage === null) {
      return html`

      `;
    }

    return html`
      <div class="message">${this.settingsMessage}</div>
    `;
  }

  #roomTitle(run: RunRecord | null): string {
    if (run === null) {
      return "none";
    }

    const kindLabel = run.kind === "discussion" ? "Debate" : "Report";
    const tag = new Date(run.createdAt).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${kindLabel} Room - ${tag}`;
  }

  #updateTextField(
    kind: "discussion" | "weeklyReport",
    field: "topic" | "goal" | "instruction" | "background",
    event: InputEvent,
  ): void {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement)
    ) {
      return;
    }

    this.launchSettings = {
      ...this.launchSettings,
      [kind]: {
        ...this.launchSettings[kind],
        [field]: target.value,
      },
    };
  }

  #updateNumberField(
    kind: "discussion" | "weeklyReport",
    field: "intervalSeconds" | "durationMinutes",
    event: InputEvent,
    minValue: number,
  ): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const parsed = Number.parseInt(target.value, 10);
    const value = Number.isFinite(parsed)
      ? Math.max(minValue, parsed)
      : minValue;

    this.launchSettings = {
      ...this.launchSettings,
      [kind]: {
        ...this.launchSettings[kind],
        [field]: value,
      },
    };
  }

  #updateForever(kind: "discussion" | "weeklyReport", event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.launchSettings = {
      ...this.launchSettings,
      [kind]: {
        ...this.launchSettings[kind],
        runForever: target.checked,
      },
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
    const request = this.#toSaveRequest(this.launchSettings[key]);

    try {
      await this.store.saveSettings(kind, request);
      this.settingsMessage = `${
        kind === "discussion" ? "Debate" : "Report"
      } settings saved to SQLite.`;
    } catch {
      this.settingsMessage = "Failed to save settings.";
    }
  }

  #onStartDiscussion = (): void => {
    const request = this.#toStartRequest(this.launchSettings.discussion);
    void this.store.startRun("discussion", request);
  };

  #onStartWeeklyReport = (): void => {
    const request = this.#toStartRequest(this.launchSettings.weeklyReport);
    void this.store.startRun("weekly_report", request);
  };
}
