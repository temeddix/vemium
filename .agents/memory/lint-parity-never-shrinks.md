---
description: Lint coverage never drops below what Deno enforced; every Deno rule maps to an Oxlint rule, a plugin rule, the compiler, or our own rule
---

Hard rule (2026-10-12): after the move, a repo has at least the lint coverage
it had under Deno: built-in rules (the `recommended` and `jsr` tags plus
opt-ins like `camelcase`, `eqeqeq`, `guard-for-in`, `no-console`,
`no-eval`, `no-throw-literal`, `no-non-null-assertion`,
`verbatim-module-syntax`), `@hugoalh` rules, and the custom plugins. Rules may
be added, never lost. Formatting may change. "Gap" is not an acceptable end
state: a Deno rule Oxlint lacks is replaced by a plugin rule or our own rule in
[[project-lint-plugin]].

Before removing any line from `configs.project`, find what else covers it.

## How the template mapped Deno's 97 rules

- **Same rule** in `configs.project` at `error`.
- **Renamed equivalent:** `no-new-symbol` → `no-new-native-nonconstructor`;
  `no-window` → `no-restricted-globals: ["error", "window"]`;
  `ban-untagged-ignore` → `unicorn/no-abusive-eslint-disable`;
  `ban-unused-ignore`, `ban-unknown-rule-code` →
  `reportUnusedDisableDirectives`; `camelcase` → built-in `id-match`
  ([[naming-id-match]]).
- **Caught by the parser or `typeCheck`:** `no-dupe-args`, `no-octal`,
  `no-await-in-sync-fn`, `no-import-assertions` (TS2880), `no-sloppy-imports`
  (TS2835), `verbatim-module-syntax` (TS1484).
- **`no-slow-types`:** vacuous here; it only matters for published packages.
- **Vacuous:** JSX rules (no `.tsx` exists) and Deno-only rules.
- **`@hugoalh` rules** (mapping confirmed 2026-10-17): `max-complexity` 16 →
  Oxlint's size rules at measured limits (2026-10-19); `max-file-lines` 2048 →
  `max-lines` 2048; `max-file-size` → dropped by the user's
  decision; `max-identifier-length` 40 → `id-length` 40;
  `max-nest-ternaries` 0 → `no-nested-ternary`; `max-params` 4 →
  `max-params` 4; `no-class-constructor-parameter-property` →
  `typescript/parameter-properties`; `no-modifier-private` →
  `project/no-modifier-private`.
- **deno-import-check's CLI cycle check** → `import/no-cycle`.

The template's list in `configs.project` is the baseline to copy: `curly`,
`guard-for-in`, `no-console`, `no-empty`, `no-regex-spaces`,
`no-restricted-globals`, `no-var`, `prefer-const`, `import/no-cycle`,
`import/no-relative-parent-imports`, `typescript/adjacent-overload-signatures`,
`typescript/consistent-type-imports`, `typescript/no-empty-interface`,
`typescript/no-explicit-any`, `typescript/no-namespace`,
`typescript/no-non-null-assertion`, the two `project/*` rules,
`unicorn/no-abusive-eslint-disable`, and `id-match`. Since 2026-10-19
`typescript/switch-exhaustiveness-check`, `consistent-return`, and
`default-case` are off: TypeScript's `noImplicitReturns` and type checking
cover a switch over a union, which gets no `default` branch (as on main).

Each migration PR states its parity mapping (or links the template's table in
cunarist/eslint-plugin-explicit-types#1) so the user can check it.
