import "@awesome.me/webawesome/dist/components/input/input.js";
import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { pad2 } from "#chat";

/**
 * A schedule: a cron expression and its label. Presets are these, and a
 * `te-change` event carries one.
 */
export interface CronChoice {
  label: string;
  cron: string;
}

declare global {
  interface HTMLElementTagNameMap {
    "te-cron-picker": CronPickerElement;
  }
  interface HTMLElementEventMap {
    "te-change": CustomEvent<CronChoice>;
  }
}

const PRESETS: CronChoice[] = [
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
export class CronPickerElement extends LitElement {
  /** Current cron expression (5 fields). */
  @property({ type: String })
  accessor cron = "0 * * * *";

  /** Human-readable label for the current cron (set by parent or preset). */
  @property({ type: String })
  accessor label = "Every hour";

  /** Component-id-style key used to scope the raw-input element id. */
  @property({ type: String })
  accessor name = "cron";

  @state()
  accessor rawInput: string | null = null;

  static override styles = css`
    .wrapper {
      display: grid;
      gap: 0.4rem;
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

  override render(): TemplateResult {
    const currentValue = this.rawInput ?? this.cron;
    const description = describeCron(currentValue);
    const chips = PRESETS.map((preset) => this.#renderChip(preset));
    const descriptionClass = description.ok
      ? "description"
      : "description is-invalid";
    return html`
      <div class="wrapper">
        <div class="chips">${chips}</div>
        <div class="raw-row">
          <wa-input
            id="${this.name}-raw"
            size="small"
            placeholder="0 9 * * *"
            .value="${currentValue}"
            @input="${this.#onInput}"
            @blur="${this.#onBlur}"
          ></wa-input>
          <span class="${descriptionClass}">${description.text}</span>
        </div>
      </div>
    `;
  }

  #renderChip(preset: CronChoice): TemplateResult {
    const isActive = (this.rawInput ?? this.cron) === preset.cron;
    const chipClass = isActive ? "chip is-active" : "chip";
    return html`
      <button
        type="button"
        class="${chipClass}"
        data-cron="${preset.cron}"
        @click="${this.#onChipClick}"
      >
        ${preset.label}
      </button>
    `;
  }

  #onChipClick = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const preset = PRESETS.find(
      (candidate) => candidate.cron === target.dataset["cron"],
    );
    if (preset !== undefined) {
      this.#applyPreset(preset);
    }
  };

  #applyPreset(preset: CronChoice): void {
    this.rawInput = null;
    this.cron = preset.cron;
    this.label = preset.label;
    this.dispatchEvent(
      new CustomEvent<CronChoice>("te-change", {
        detail: { cron: preset.cron, label: preset.label },
        bubbles: true,
        composed: true,
      }),
    );
  }

  #onInput = (event: InputEvent): void => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      "value" in target &&
      typeof target.value === "string"
    ) {
      this.rawInput = target.value;
    }
  };

  #onBlur = (): void => {
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
      new CustomEvent<CronChoice>("te-change", {
        detail: { cron: trimmed, label },
        bubbles: true,
        composed: true,
      }),
    );
  };
}

/** The five fields of a cron expression, each parsed. */
interface ParsedCron {
  minute: FieldSpec;
  hour: FieldSpec;
  dom: FieldSpec;
  month: FieldSpec;
  dow: FieldSpec;
}

/** Splits an expression into its five parsed fields, or explains why not. */
function parseCron(trimmed: string): ParsedCron | string {
  const parts = trimmed.split(/\s+/u);
  if (parts.length !== 5) {
    return "Expected 5 fields: minute hour day-of-month month day-of-week.";
  }
  const [minute = "", hour = "", dom = "", month = "", dow = ""] = parts;
  const parsed: ParsedCron = {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dom: parseField(dom, 1, 31),
    month: parseField(month, 1, 12),
    dow: parseField(dow, 0, 6),
  };
  const firstError =
    parsed.minute.error ??
    parsed.hour.error ??
    parsed.dom.error ??
    parsed.month.error ??
    parsed.dow.error;
  return firstError ?? parsed;
}

/**
 * Computes the first firing of `expression` strictly after `now`, treating
 * the cron expression in UTC the same way the backend does with the
 * `cron` crate. Returns `null` when the expression fails to parse or when
 * no firing falls within the next ~1 year (the iteration cap is generous
 * enough to cover any realistic schedule the picker can emit).
 */
export function nextCronTick(expression: string, now: Date): Date | null {
  const trimmed = expression.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = parseCron(trimmed);
  if (typeof parsed === "string") {
    return null;
  }

  const candidate = new Date(now);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Bound the search at ~1 year of minute-level steps. Real schedules
  // emitted by the picker fire at least once a week, so the cap exists to
  // protect against impossible combinations (e.g. `0 0 31 2 *`).
  const MAX_ITERATIONS = 366 * 24 * 60;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    if (matchesCron(candidate, parsed)) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

function fieldMatches(
  spec: FieldSpec,
  value: number,
  fieldMin: number,
): boolean {
  if (spec.star) {
    return true;
  }
  if (spec.step !== null) {
    return (value - fieldMin) % spec.step === 0;
  }
  return spec.values.includes(value);
}

function matchesCron(date: Date, parsed: ParsedCron): boolean {
  const { minute, hour, dom, month, dow } = parsed;
  if (!fieldMatches(minute, date.getUTCMinutes(), 0)) {
    return false;
  }
  if (!fieldMatches(hour, date.getUTCHours(), 0)) {
    return false;
  }
  if (!fieldMatches(month, date.getUTCMonth() + 1, 1)) {
    return false;
  }
  // Vixie cron semantics: when both day-of-month and day-of-week are
  // restricted, fire when EITHER matches. When at most one is restricted,
  // both must match (and the unrestricted one matches everything).
  const dayOfMonth = date.getUTCDate();
  const dayOfWeek = date.getUTCDay();
  const domRestricted = !dom.star;
  const dowRestricted = !dow.star;
  if (domRestricted && dowRestricted) {
    return fieldMatches(dom, dayOfMonth, 1) || fieldMatches(dow, dayOfWeek, 0);
  }
  return fieldMatches(dom, dayOfMonth, 1) && fieldMatches(dow, dayOfWeek, 0);
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
  const parsed = parseCron(trimmed);
  if (typeof parsed === "string") {
    return { ok: false, text: parsed };
  }
  return { ok: true, text: humanize(parsed) };
}

interface FieldSpec {
  raw: string;
  star: boolean;
  // For step fields (asterisk slash N), holds N.
  step: number | null;
  // Concrete listed values. Only populated when the field is not a step.
  values: number[];
  error: string | null;
}

/** A whole number written in decimal digits. */
const NUMBER_PATTERN = /^\d+$/u;

/** A step field, `*` `/` N. */
const STEP_PATTERN = /^\*\/(?<step>\d+)$/u;

/** A range, N-M. */
const RANGE_PATTERN = /^(?<start>\d+)-(?<end>\d+)$/u;

/** The values of one comma-separated piece, or why it is invalid. */
function parsePiece(
  piece: string,
  min: number,
  max: number,
): number[] | string {
  const range = RANGE_PATTERN.exec(piece)?.groups;
  if (range !== undefined) {
    const start = Math.trunc(Number(range["start"]));
    const end = Math.trunc(Number(range["end"]));
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < min ||
      end > max ||
      start > end
    ) {
      return `Invalid range "${piece}" (allowed ${min}-${max}).`;
    }
    const values: number[] = [];
    for (let value = start; value <= end; value += 1) {
      values.push(value);
    }
    return values;
  }
  if (!NUMBER_PATTERN.test(piece)) {
    return `Invalid token "${piece}".`;
  }
  const value = Math.trunc(Number(piece));
  if (!Number.isFinite(value) || value < min || value > max) {
    return `Out of range "${piece}" (allowed ${min}-${max}).`;
  }
  return [value];
}

function parseField(raw: string, min: number, max: number): FieldSpec {
  const empty: FieldSpec = {
    raw,
    star: false,
    step: null,
    values: [],
    error: null,
  };
  if (raw === "*") {
    return { ...empty, star: true };
  }
  const stepMatch = STEP_PATTERN.exec(raw)?.groups;
  if (stepMatch !== undefined) {
    const step = Math.trunc(Number(stepMatch["step"]));
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
    const parsed = parsePiece(piece, min, max);
    if (typeof parsed === "string") {
      return { ...empty, error: parsed };
    }
    values.push(...parsed);
  }
  return { ...empty, values };
}

function humanize(parsed: ParsedCron): string {
  const { minute, hour, dom, month, dow } = parsed;
  const [firstMinute = 0] = minute.values;
  const [firstHour = 0] = hour.values;

  // Common helpers.
  const everyDay = dom.star && month.star && dow.star;

  // Minute-stepped cadence: */N * * * *
  if (minute.step !== null && hour.star && everyDay) {
    return everyN("MINUTE", minute.step);
  }

  // Hour-stepped cadence: 0 */N * * * (or other minute literal)
  if (minute.values.length === 1 && hour.step !== null && everyDay) {
    if (firstMinute === 0) {
      return everyN("HOUR", hour.step);
    }
    return `Every ${hour.step} hours at minute ${pad2(firstMinute)}`;
  }

  // Hourly: 0 * * * *
  if (
    minute.values.length === 1 &&
    firstMinute === 0 &&
    hour.star &&
    everyDay
  ) {
    return "Every hour at :00";
  }

  // Every minute.
  if (minute.star && hour.star && everyDay) {
    return "Every minute";
  }

  // Daily at HH:MM, weekday-restricted optional.
  if (
    minute.values.length === 1 &&
    hour.values.length === 1 &&
    dom.star &&
    month.star
  ) {
    const time = `${pad2(firstHour)}:${pad2(firstMinute)} UTC`;
    if (dow.star) {
      return `Every day at ${time}`;
    }
    if (dow.values.length > 0) {
      return `${weekdayList(dow.values)} at ${time}`;
    }
  }

  // Multiple times per day: 0 9,18 * * *
  if (
    minute.values.length === 1 &&
    hour.values.length > 1 &&
    dom.star &&
    month.star &&
    dow.star
  ) {
    const times = hour.values
      .map((hourValue) => `${pad2(hourValue)}:${pad2(firstMinute)}`)
      .join(", ");
    return `Every day at ${times} UTC`;
  }

  // Fallback: echo the raw expression.
  return `Custom: ${minute.raw} ${hour.raw} ${dom.raw} ${month.raw} ${dow.raw}`;
}

/** The unit a stepped cadence counts in. */
type CadenceUnit = "MINUTE" | "HOUR";

function everyN(unit: CadenceUnit, step: number): string {
  const unitName = unit === "MINUTE" ? "minute" : "hour";
  if (step === 1) {
    return `Every ${unitName}`;
  }
  return `Every ${step} ${unitName}s`;
}

const WEEKDAYS: string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** The weekday a cron day-of-week number names. */
function weekdayName(day: number): string {
  return WEEKDAYS[day % 7] ?? "";
}

function weekdayList(values: number[]): string {
  if (
    values.length === 5 &&
    [1, 2, 3, 4, 5].every((day) => values.includes(day))
  ) {
    return "Every weekday";
  }
  if (values.length === 2 && values.includes(0) && values.includes(6)) {
    return "Every weekend";
  }
  const names = values.map((day) => weekdayName(day));
  return `Every ${names.join(", ")}`;
}
