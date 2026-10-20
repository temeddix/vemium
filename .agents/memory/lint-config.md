---
description: Frontend lint config - every Oxlint category but nursery, plugins via their all configs, offs and options in projectLint.configs.project, per-file exceptions only in projectOverrides, ignorePatterns only for generated output
---

The frontend lint is a blacklist (user decisions 2026-10-14 to 2026-10-19):
everything is on, and `frontend/scripts/project-lint.ts`
([[project-lint-plugin]]) lists only what is turned off or tuned.

```ts
// frontend/vite.config.ts
lint: {
  plugins: ["typescript", "unicorn", "oxc", "import"],
  jsPlugins: ["eslint-plugin-explicit-types", /* ... */ "./scripts/project-lint.ts"],
  categories: { correctness: "error", suspicious: "error", pedantic: "error", perf: "error", style: "error", restriction: "error" },
  rules: {
    ...explicitTypes.configs.all.rules,
    ...importStructure.configs.all.rules,
    ...litRobust.configs.all.rules,
    ...projectLint.configs.project.rules, // last: offs and options win
  },
  overrides: projectOverrides,
  options: { typeAware: true, typeCheck: true, maxWarnings: 0, reportUnusedDisableDirectives: "error" },
},

// frontend/scripts/project-lint.ts
export const projectOverrides: OxlintOverride[] = [
  // Node code, loaded by Vite and Oxlint through its default export.
  { files: ["vite.config.ts", "scripts/**"], rules: nodeRules },
];
```

- **Categories:** `correctness`, `suspicious`, `pedantic`, `perf`, `style`,
  and `restriction` at `error`. `nursery` stays off by default and is not
  listed.
- **Plugins:** each published plugin is spread whole through its `all`
  config; Oxlint plugins carry no configs, so the package goes in
  `jsPlugins` and its `configs.all.rules` in `rules`.
- **Blacklist:** `projectLint.configs.project.rules`, spread last, holds the
  `project/*` rules, option tweaks, and repo-wide offs, each with a one-line
  reason grouped as "collides with ..." or "too much churn". It never
  re-lists a rule a category already turns on. A new hit is fixed in code;
  an off needs a collision or a user decision.
- **Size limits** are option values there. Deno had none, so `max-lines` is
  the apps' 2048 (blank and comment lines counted) and the rest sit at the
  smallest limit the migrated code passed (2026-10-20): `complexity` 30,
  `max-depth` 3, `max-lines-per-function` 69, `max-nested-callbacks` 2,
  `max-statements` 24, `max-classes-per-file` 1, `import/max-dependencies`
  16, `unicorn/max-nested-calls` 3, `max-params` 4; `id-length` keeps its
  default minimum with single capital type parameters exempt. No file is
  split for size; a change that needs a slightly higher limit raises it.
- **Per-file exceptions** live only in `projectOverrides`, the whole
  `overrides` array, Node-code entry first, then one entry per exception with
  a why-comment. `vite.config.ts` uses it as is and names no rule itself.
  No custom rule takes an `allowFiles`-style option. A new exception for
  hand-written code needs the user's approval; when they are away, refactor
  or leave it failing and log the question.
- **No disable comments** in any form: [[lint-no-disable-comments]].
- **`ignorePatterns`** is only for generated or build output, never for
  hand-written code. The frontend has none today: the bundle the build
  writes to `frontend/dist/js/` is gitignored, which Oxlint and Oxfmt
  honor.
- **Precedence:** categories < `rules` (a later spread wins) < `overrides`
  (a later entry wins).

Related: [[lint-parity-never-shrinks]], [[naming-id-match]]. The modules
plugin's `enforce-import-order` is the only import sorter; Oxfmt's
`sortImports` stays off.

## Rule decisions of 2026-10-19

- **On:** `typescript/promise-function-async` with `require-await` and
  `typescript/return-await`: a promise-returning function is `async` and
  awaits, `async f() { const x = await g(); return x; }`.
  `init-declarations` (`let x: T | null = null`), `no-use-before-define`
  with only `{ functions: false }`, `unicorn/no-array-for-each`
  (`for...of`), `unicorn/no-array-reduce`, `unicorn/prefer-structured-clone`,
  `typescript/prefer-nullish-coalescing` (defaults).
- **`unknown` is allowed**; `any` is banned, and `no-unsafe-*` are on.
  Untrusted data (`response.json()`, `JSON.parse`, stream frames) is
  `unknown` checked by a type guard (`isSettingsView` etc. in `types.ts`),
  never a typed wrapper that hides the `any`.
- **Off:** `no-await-in-loop` (sequential awaits are intended),
  `consistent-return`, `typescript/switch-exhaustiveness-check`, and
  `default-case` (TypeScript covers exhaustive switches; no `default`
  branches on a switch over a union).
- **hugoalh ports** (2026-10-19), copied from eslint-plugin-import-structure's
  scripts with the same behavior: `project/no-duplicate-typeofs`,
  `no-empty-yield`, `no-nan`, `no-unsafe-number`, `no-useless-continue`,
  `no-duplicate-interfaces`, `no-duplicate-types`, `no-useless-type`;
  `no-enum` is `explicit-types/no-enum` (via `configs.all`). Not
  `no-duplicate-awaits`/`voids`: `unicorn/no-unnecessary-await` and
  `typescript/no-meaningless-void-operator` cover them. A `NaN` sentinel
  becomes `null`: `x === "" ? null : Math.trunc(Number(x))`.
- Behavior may differ from main when the change is more modern, cleaner,
  and not more dangerous.
