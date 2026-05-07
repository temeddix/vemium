import type { ReportBuffer } from "@/app/types";
import { formatTimestamp } from "@/app/utils";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-reports-dialog": RoomReportsDialog;
  }
}

interface DialogElement extends HTMLElement {
  open: boolean;
}

/**
 * Modal that lists every leader-generated report for a room. Reports are
 * presented newest first; long markdown bodies render via `wa-markdown`.
 * The parent calls `show()` to open the dialog; dismissal (ESC, backdrop,
 * close button) is handled by `wa-dialog` itself.
 */
@customElement("te-room-reports-dialog")
export class RoomReportsDialog extends LitElement {
  @property({ attribute: false })
  accessor reports: ReportBuffer[] = [];

  #dialogRef: Ref<DialogElement> = createRef();

  static override styles = css`
    wa-dialog {
      --width: 60rem;
    }

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

  /** Open the dialog. */
  show(): void {
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
  }

  override render() {
    return html`
      <wa-dialog ${ref(this.#dialogRef)} label="Reports">
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
                ${report.completedAt === null
                  ? html`
                    <wa-badge size="small">streaming</wa-badge>
                  `
                  : html`
                    <span>- ${formatTimestamp(report.completedAt)}</span>
                  `}
              </div>
              ${renderMarkdown(report.content || "...")}
            </li>
          `
        )}
      </ul>
    `;
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
