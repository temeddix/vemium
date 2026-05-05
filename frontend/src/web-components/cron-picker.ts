import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-cron-picker": CronPicker;
  }
}

interface PresetOption {
  label: string;
  cron: string;
}

const PRESETS: PresetOption[] = [
  { label: "Every 15 minutes", cron: "*/15 * * * *" },
  { label: "Every 30 minutes", cron: "*/30 * * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 3 hours", cron: "0 */3 * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Every day at 09:00 UTC", cron: "0 9 * * *" },
  { label: "Every day at 18:00 UTC", cron: "0 18 * * *" },
  { label: "Every Monday at 09:00 UTC", cron: "0 9 * * 1" },
];

/**
 * Cron expression picker. Renders preset chips for common cadences plus a
 * raw 5-field input for arbitrary expressions, along with a live preview
 * line that either describes the expression in English or reports a parse
 * error.
 *
 * Emits `te-change` with `detail: { cron, label }` whenever the user picks
 * a preset, edits the raw text, or moves focus away from a valid raw
 * expression. The parent owns the form state; this component is purely
 * presentational beyond the validate/describe helpers.
 */
@customElement("te-cron-picker")
export class CronPicker extends LitElement {
  /** Current cron expression (5 fields). */
  @property({ type: String })
  accessor cron = "0 * * * *";

  /** Human-readable label for the current cron (set by parent or preset). */
  @property({ type: String })
  accessor label = "Every hour";

  /** Tooltip / helper text rendered above the picker. */
  @property({ type: String })
  accessor helperText = "";

  /** Component-id-style key used to scope the raw-input element id. */
  @property({ type: String })
  accessor name = "cron";

  @state()
  private accessor rawInput: string | null = null;

  static override styles = css`
    .wrapper {
      display: grid;
      gap: 0.4rem;
    }

    .helper {
      font-size: 0.78rem;
      color: var(--wa-color-text-quiet);
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }

    .chip {
      font-size: 0.72rem;
      padding: 0.25rem 0.55rem;
      border-radius: 999px;
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      background: transparent;
      color: var(--wa-color-text-normal);
      cursor: pointer;
      font: inherit;
      line-height: 1;
    }

    .chip:hover {
      border-color: var(--wa-color-brand-border-normal);
    }

    .chip.is-active {
      background: var(--wa-color-brand-fill-quiet);
      border-color: var(--wa-color-brand-border-normal);
      color: var(--wa-color-brand-on-quiet);
    }

    .raw-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25rem;
    }

    .description {
      font-size: 0.78rem;
      color: var(--wa-color-text-quiet);
    }

    .description.is-invalid {
      color: var(--wa-color-danger-on-quiet);
    }

    code {
      font-family: var(--wa-font-family-code, ui-monospace, monospace);
    }
  `;

  override render() {
    const currentValue = this.rawInput ?? this.cron;
    const description = describeCron(currentValue);
    return html`
      <div class="wrapper">
        ${this.helperText !== ""
          ? html`
            <span class="helper">${this.helperText}</span>
          `
          : nothing}
        <div class="chips">
          ${PRESETS.map((preset) => this.#renderChip(preset))}
        </div>
        <div class="raw-row">
          <wa-input
            id="${this.name}-raw"
            size="small"
            placeholder="0 9 * * *"
            .value="${currentValue}"
            @input="${this.#onInput}"
            @blur="${this.#onBlur}"
          ></wa-input>
          <span
            class="description ${description.ok ? "" : "is-invalid"}"
          >
            ${description.text}
          </span>
        </div>
      </div>
    `;
  }

  #renderChip(preset: PresetOption) {
    const isActive = (this.rawInput ?? this.cron) === preset.cron;
    return html`
      <button
        type="button"
        class="chip ${isActive ? "is-active" : ""}"
        @click="${(): void => this.#applyPreset(preset)}"
      >
        ${preset.label}
      </button>
    `;
  }

  #applyPreset(preset: PresetOption): void {
    this.rawInput = null;
    this.cron = preset.cron;
    this.label = preset.label;
    this.dispatchEvent(
      new CustomEvent("te-change", {
        detail: { cron: preset.cron, label: preset.label },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #onInput(event: InputEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !("value" in target)) {
      return;
    }
    const value = (target as Record<string, unknown>)["value"];
    if (typeof value !== "string") {
      return;
    }
    this.rawInput = value;
  }

  #onBlur(): void {
    if (this.rawInput === null) {
      return;
    }
    const trimmed = this.rawInput.trim();
    const description = describeCron(trimmed);
    if (!description.ok) {
      // Keep the raw text visible so the user can fix it; do not propagate
      // the invalid value to the parent.
      return;
    }
    const matched = PRESETS.find((preset) => preset.cron === trimmed);
    const label = matched?.label ?? description.text;
    this.cron = trimmed;
    this.label = label;
    this.rawInput = null;
    this.dispatchEvent(
      new CustomEvent("te-change", {
        detail: { cron: trimmed, label },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

interface CronDescription {
  ok: boolean;
  text: string;
}

/**
 * Validates a 5-field cron expression and returns a human-readable
 * description (`"Every day at 09:00 UTC"`) on success, or an error message
 * on failure. Public so the create/settings dialogs can reuse it for
 * inline validation before submit.
 */
export function describeCron(expression: string): CronDescription {
  const trimmed = expression.trim();
  if (trimmed === "") {
    return { ok: false, text: "Cron expression is required." };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return {
      ok: false,
      text: "Expected 5 fields: minute hour day-of-month month day-of-week.",
    };
  }
  const [minute, hour, dom, month, dow] = parts;
  const minuteSpec = parseField(minute, 0, 59);
  const hourSpec = parseField(hour, 0, 23);
  const domSpec = parseField(dom, 1, 31);
  const monthSpec = parseField(month, 1, 12);
  const dowSpec = parseField(dow, 0, 6);
  const firstError = minuteSpec.error ?? hourSpec.error ?? domSpec.error ??
    monthSpec.error ?? dowSpec.error;
  if (firstError !== undefined) {
    return { ok: false, text: firstError };
  }
  return {
    ok: true,
    text: humanize({
      minute: minuteSpec,
      hour: hourSpec,
      dom: domSpec,
      month: monthSpec,
      dow: dowSpec,
    }),
  };
}

interface FieldSpec {
  raw: string;
  star: boolean;
  // For step fields (asterisk slash N), holds N.
  step: number | null;
  // Concrete listed values. Only populated when the field is not a step.
  values: number[];
  error: string | undefined;
}

function parseField(raw: string, min: number, max: number): FieldSpec {
  const empty: FieldSpec = {
    raw,
    star: false,
    step: null,
    values: [],
    error: undefined,
  };
  if (raw === "*") {
    return { ...empty, star: true };
  }
  const stepMatch = raw.match(/^\*\/(\d+)$/);
  if (stepMatch !== null) {
    const step = Number.parseInt(stepMatch[1], 10);
    if (!Number.isFinite(step) || step <= 0) {
      return {
        ...empty,
        error: `Invalid step "${raw}": step must be a positive integer.`,
      };
    }
    return { ...empty, step };
  }
  const values: number[] = [];
  for (const piece of raw.split(",")) {
    const rangeMatch = piece.match(/^(\d+)-(\d+)$/);
    if (rangeMatch !== null) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      if (
        !Number.isFinite(start) || !Number.isFinite(end) ||
        start < min || end > max || start > end
      ) {
        return {
          ...empty,
          error: `Invalid range "${piece}" (allowed ${min}-${max}).`,
        };
      }
      for (let n = start; n <= end; n += 1) {
        values.push(n);
      }
      continue;
    }
    if (!/^\d+$/.test(piece)) {
      return {
        ...empty,
        error: `Invalid token "${piece}".`,
      };
    }
    const n = Number.parseInt(piece, 10);
    if (!Number.isFinite(n) || n < min || n > max) {
      return {
        ...empty,
        error: `Out of range "${piece}" (allowed ${min}-${max}).`,
      };
    }
    values.push(n);
  }
  return { ...empty, values };
}

interface ParsedCron {
  minute: FieldSpec;
  hour: FieldSpec;
  dom: FieldSpec;
  month: FieldSpec;
  dow: FieldSpec;
}

function humanize(parsed: ParsedCron): string {
  const { minute, hour, dom, month, dow } = parsed;

  // Common helpers.
  const everyDay = dom.star && month.star && dow.star;

  // Minute-stepped cadence: */N * * * *
  if (
    minute.step !== null && hour.star && everyDay
  ) {
    return everyN("minute", minute.step);
  }

  // Hour-stepped cadence: 0 */N * * * (or other minute literal)
  if (
    minute.values.length === 1 && hour.step !== null && everyDay
  ) {
    if (minute.values[0] === 0) {
      return everyN("hour", hour.step);
    }
    return `Every ${hour.step} hours at minute ${pad2(minute.values[0])}`;
  }

  // Hourly: 0 * * * *
  if (
    minute.values.length === 1 && minute.values[0] === 0 &&
    hour.star && everyDay
  ) {
    return "Every hour at :00";
  }

  // Every minute.
  if (minute.star && hour.star && everyDay) {
    return "Every minute";
  }

  // Daily at HH:MM, weekday-restricted optional.
  if (
    minute.values.length === 1 && hour.values.length === 1 &&
    dom.star && month.star
  ) {
    const time = `${pad2(hour.values[0])}:${pad2(minute.values[0])} UTC`;
    if (dow.star) {
      return `Every day at ${time}`;
    }
    if (dow.values.length > 0) {
      return `${weekdayList(dow.values)} at ${time}`;
    }
  }

  // Multiple times per day: 0 9,18 * * *
  if (
    minute.values.length === 1 && hour.values.length > 1 &&
    dom.star && month.star && dow.star
  ) {
    const times = hour.values
      .map((h) => `${pad2(h)}:${pad2(minute.values[0])}`)
      .join(", ");
    return `Every day at ${times} UTC`;
  }

  // Fallback: echo the raw expression.
  return `Custom: ${minute.raw} ${hour.raw} ${dom.raw} ${month.raw} ${dow.raw}`;
}

function everyN(unit: "minute" | "hour", step: number): string {
  if (step === 1) {
    return unit === "minute" ? "Every minute" : "Every hour";
  }
  return `Every ${step} ${unit}s`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function weekdayList(values: number[]): string {
  if (values.length === 5 && [1, 2, 3, 4, 5].every((d) => values.includes(d))) {
    return "Every weekday";
  }
  if (values.length === 2 && values.includes(0) && values.includes(6)) {
    return "Every weekend";
  }
  if (values.length === 1) {
    return `Every ${WEEKDAYS[values[0] % 7]}`;
  }
  const names = values.map((d) => WEEKDAYS[d % 7]);
  return `Every ${names.join(", ")}`;
}
