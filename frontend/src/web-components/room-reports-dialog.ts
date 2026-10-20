import "@awesome.me/webawesome/dist/components/badge/badge.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import WaMarkdown from "@awesome.me/webawesome/dist/components/markdown/markdown.js";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

import type { ReportBuffer } from "#types";
import { formatTimestamp } from "#utils";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-reports-dialog": RoomReportsDialogElement;
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
export class RoomReportsDialogElement extends LitElement {
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

  override render(): TemplateResult {
    const dialogRef = ref(this.#dialogRef);
    const body = this.#renderBody();
    return html`
      <wa-dialog ${dialogRef} label="Reports">${body}</wa-dialog>
    `;
  }

  #renderBody(): TemplateResult {
    if (this.reports.length === 0) {
      return html`
        <p class="empty">No reports yet.</p>
      `;
    }
    const sorted = this.reports.toSorted(
      (left, right) => right.sequence - left.sequence,
    );
    const items = sorted.map((report) => this.#renderReport(report));
    return html`
      <ul class="report-list">${items}</ul>
    `;
  }

  #renderReport(report: ReportBuffer): TemplateResult {
    const status = this.#renderStatus(report);
    const completedAt = report.completedAt ?? "";
    const completedLabel =
      completedAt === "" ? "" : formatTimestamp(completedAt);
    const completed =
      completedLabel === ""
        ? nothing
        : html`
          <span>- ${completedLabel}</span>
        `;
    const body = renderMarkdown(report.content === "" ? "..." : report.content);
    return html`
      <li class="report-item">
        <div class="report-meta">
          <strong>Report #${report.sequence}</strong>
          ${status} ${completed}
        </div>
        ${body}
      </li>
    `;
  }

  #renderStatus(report: ReportBuffer): TemplateResult {
    if (report.completedAt === null) {
      return html`
        <wa-badge size="small">streaming</wa-badge>
      `;
    }
    if (!report.success) {
      return html`
        <wa-badge size="small">failed</wa-badge>
      `;
    }
    return html`
      <wa-badge size="small">done</wa-badge>
    `;
  }
}

function renderMarkdown(content: string): TemplateResult {
  const markdownRef = ref((el): void => {
    if (!(el instanceof WaMarkdown)) {
      return;
    }
    let script = el.querySelector('script[type="text/markdown"]');
    if (script === null) {
      script = document.createElement("script");
      script.setAttribute("type", "text/markdown");
      el.append(script);
    }
    if (script.textContent !== content) {
      script.textContent = content;
      el.renderMarkdown();
    }
  });
  return html`
    <wa-markdown ${markdownRef}></wa-markdown>
  `;
}
