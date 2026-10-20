/**
 * Labelled form fields the room dialogs and the settings page share. Each
 * renderer is a pure function of its arguments: the caller owns the value
 * and the `input` handler, and updates its own state from the handler.
 *
 * @module
 */

import "@awesome.me/webawesome/dist/components/icon/icon.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/textarea/textarea.js";
import "@awesome.me/webawesome/dist/components/tooltip/tooltip.js";
import { html, nothing, type TemplateResult } from "lit";

/** What a field shows around its control. */
export interface FieldSpec {
  /** Unique per form; names the tooltip anchor. */
  key: string;
  label: string;
  /** Help text behind a question-mark icon; empty for none. */
  tooltip: string;
}

/** Handles a field's `input` event. */
type InputHandler = (event: Event) => void;

/** The string `value` of the element an event came from, or "". */
export function readInputValue(target: EventTarget | null): string {
  if (!(target instanceof HTMLElement) || !("value" in target)) {
    return "";
  }
  return typeof target.value === "string" ? target.value : "";
}

/**
 * The whole number typed into a number field, at least 1, or null while the
 * field holds no number.
 */
export function readPositiveInteger(target: EventTarget | null): number | null {
  const raw = readInputValue(target).trim();
  const parsed = Math.trunc(Number(raw));
  if (raw === "" || !Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(1, parsed);
}

/** A field's label, with its tooltip icon when it has help text. */
export function renderLabel(spec: FieldSpec): TemplateResult {
  if (spec.tooltip === "") {
    return html`
      <span class="form-label">${spec.label}</span>
    `;
  }
  const anchorId = `tip-${spec.key}`;
  return html`
    <span class="form-label">
      <span>${spec.label}</span>
      <wa-icon
        id="${anchorId}"
        class="help-icon"
        name="circle-question"
        tabindex="0"
      ></wa-icon>
    </span>
    <wa-tooltip for="${anchorId}" placement="top">${spec.tooltip}</wa-tooltip>
  `;
}

/** A labelled one-line text input. */
export function renderTextField(
  spec: FieldSpec,
  value: string,
  onInput: InputHandler,
): TemplateResult {
  const label = renderLabel(spec);
  return html`
    <label class="form-field">
      ${label}
      <wa-input size="small" .value="${value}" @input="${onInput}"></wa-input>
    </label>
  `;
}

/** A labelled three-row text area. */
export function renderTextArea(
  spec: FieldSpec,
  value: string,
  onInput: InputHandler,
): TemplateResult {
  const label = renderLabel(spec);
  return html`
    <label class="form-field">
      ${label}
      <wa-textarea
        size="small"
        rows="3"
        .value="${value}"
        @input="${onInput}"
      ></wa-textarea>
    </label>
  `;
}

/** A labelled number input of whole numbers from 1, with a unit suffix. */
export function renderNumberField(
  spec: FieldSpec,
  value: number,
  suffix: string,
  onInput: InputHandler,
): TemplateResult {
  const label = renderLabel(spec);
  const text = String(value);
  const affix =
    suffix === ""
      ? nothing
      : html`
        <span slot="end" class="input-affix">${suffix}</span>
      `;
  return html`
    <label class="form-field">
      ${label}
      <wa-input
        type="number"
        size="small"
        min="1"
        without-spin-buttons
        .value="${text}"
        @input="${onInput}"
      >
        ${affix}
      </wa-input>
    </label>
  `;
}

/** A labelled password input with a show/hide toggle. */
export function renderPasswordField(
  spec: FieldSpec,
  value: string,
  onInput: InputHandler,
): TemplateResult {
  const label = renderLabel(spec);
  return html`
    <label class="form-field">
      ${label}
      <wa-input
        type="password"
        size="small"
        password-toggle
        .value="${value}"
        @input="${onInput}"
      ></wa-input>
    </label>
  `;
}
