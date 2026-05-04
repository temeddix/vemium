import type { ReportBuffer } from "@/app/types";
import { formatTimestamp } from "@/app/utils";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-reports-dialog": RoomReportsDialog;
  }
}

/**
 * Modal that lists every leader-generated report for a room. Reports are
 * presented newest first; long markdown bodies render via `wa-markdown`.
 */
@customElement("te-room-reports-dialog")
export class RoomReportsDialog extends LitElement {
  @property({ attribute: false })
  accessor reports: ReportBuffer[] = [];

  @property({ type: Boolean })
  accessor open = false;

  static override styles = css`
    .report-list {
      display: grid;
      gap: 0.6rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .report-item {
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      border-radius: 0.5rem;
      padding: 0.7rem 0.85rem;
    }

    .report-meta {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.78rem;
      color: var(--wa-color-text-quiet);
      margin-bottom: 0.35rem;
    }

    .empty {
      padding: 1rem;
      text-align: center;
      color: var(--wa-color-text-quiet);
    }
  `;

  override render() {
    return html`
      <wa-dialog
        label="Reports"
        ?open="${this.open}"
        @wa-hide="${this.#onHide}"
      >
        ${this.#renderBody()}
      </wa-dialog>
    `;
  }

  #renderBody() {
    if (this.reports.length === 0) {
      return html`
        <p class="empty">No reports yet.</p>
      `;
    }
    const sorted = [...this.reports].sort((a, b) => b.sequence - a.sequence);
    return html`
      <ul class="report-list">
        ${sorted.map((report) =>
          html`
            <li class="report-item">
              <div class="report-meta">
                <strong>Report #${report.sequence}</strong>
                ${this.#renderStatus(report.status)} ${report.completedAt
                  ? html`
                    <span>- ${formatTimestamp(report.completedAt)}</span>
                  `
                  : nothing}
              </div>
              ${renderMarkdown(report.content || "...")}
            </li>
          `
        )}
      </ul>
    `;
  }

  #renderStatus(status: ReportBuffer["status"]) {
    if (status === "streaming") {
      return html`
        <wa-badge size="small">streaming</wa-badge>
      `;
    }
    if (status === "failed") {
      return html`
        <wa-badge size="small">failed</wa-badge>
      `;
    }
    return html`
      <wa-badge size="small">done</wa-badge>
    `;
  }

  #onHide(): void {
    if (!this.open) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("te-close", { bubbles: true, composed: true }),
    );
  }
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
