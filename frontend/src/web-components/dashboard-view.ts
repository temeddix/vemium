import { dashboardContext } from "@/app/context";
import type { DashboardStore } from "@/app/state";
import type { DashboardState } from "@/app/types";
import { formatTimestamp } from "@/app/utils";
import { consume } from "@lit/context";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";

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
      max-width: 78rem;
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
      grid-template-columns: minmax(0, 1.6fr) minmax(18rem, 1fr);
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
      transition:
        border-color 140ms ease,
        transform 140ms ease,
        background 140ms ease;
      }

      button:hover {
        border-color: var(--accent);
        background: #21355d;
        transform: translateY(-1px);
      }

      button:disabled {
        opacity: 0.45;
        cursor: wait;
        transform: none;
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
        max-height: 32rem;
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
      }

      .agents {
        display: grid;
        gap: 0.55rem;
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
              Real-time multi-agent debate stream
            </p>
          </section>

          <section class="content">
            <article class="panel">
              <h2 class="section-title">Live Debate</h2>
              <div class="actions">
                <button
                  ?disabled="${this.dashboardState.isStartingRun}"
                  @click="${this.#onStartDiscussion}"
                >
                  Start Discussion Run
                </button>
                <button
                  ?disabled="${this.dashboardState.isStartingRun}"
                  @click="${this.#onStartWeeklyReport}"
                >
                  Start Weekly Report Run
                </button>
              </div>

              <div class="status">
                <span>
                  Active run: ${this.dashboardState.activeRun?.id ?? "none"}
                </span>
                <span class="${wsClass}">${wsText}</span>
              </div>

              <ul class="event-list">
                ${this.#renderEvents()}
              </ul>

              ${this.#renderError()}
            </article>

            <aside class="panel">
              <h2 class="section-title">Agent Snapshot</h2>
              <div class="agents">
                ${this.#renderAgents()}
              </div>
            </aside>
          </section>
        </main>
      `;
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
        this.dashboardState === null ||
        this.dashboardState.errorMessage === null
      ) {
        return html`

        `;
      }

      return html`
        <div class="error">${this.dashboardState.errorMessage}</div>
      `;
    }

    #onStartDiscussion = (): void => {
      void this.store.startRun("discussion");
    };

    #onStartWeeklyReport = (): void => {
      void this.store.startRun("weekly_report");
    };
  }
