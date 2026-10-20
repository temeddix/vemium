---
description: vemium's migration from Deno to Node + Vite+ (2026-10-20) - Deno lint parity mapping, the refactors the plugin configs forced, and the UPPER_SNAKE wire change
---

vemium moved from Deno (`frontend/deno.json`, `deno bundle`) to Node 24 +
Vite+ on 2026-10-20 in one PR. Behavior is meant to match main, except where
a change is more modern, cleaner, and not more dangerous.

## Deno lint parity

The Deno config was the recommended rules, the `@hugoalh/deno-lint-rules`
0.8.3 `recommended` set, `@ayk/lint-import-order`, and the opt-ins
`eqeqeq`, `camelcase`, `guard-for-in`, `no-console`, `no-const-assign`,
`no-eval`, `no-external-import`, `no-non-null-asserted-optional-chain`,
`no-non-null-assertion`, `no-throw-literal`, `prefer-ascii`, and
`verbatim-module-syntax`. On Oxlint ([[lint-config]]):

- `camelcase` is `id-match` ([[naming-id-match]]); `no-external-import` is a
  `no-restricted-imports` pattern for `http(s):`, `npm:`, and `jsr:`; Deno's
  `no-window` is `no-restricted-globals`; `prefer-ascii` is
  `project/prefer-ascii`; `verbatim-module-syntax` is the tsconfig option;
  the rest are built-ins the categories turn on.
- `@ayk/lint-import-order` is `import-structure/enforce-import-order`.
- The hugoalh ports live in `scripts/project-lint.ts`
  ([[project-lint-plugin]]); `no-enum` is `explicit-types/no-enum`. hugoalh's
  `recommended` set has no size rules, so the size limits are measured.
- vemium had no custom Deno plugin, so `eslint-plugin-explicit-types`,
  `eslint-plugin-import-structure`, and `eslint-plugin-lit-robust` are new
  coverage, each through its `all` config.

## Refactors the new configs forced

- Lifecycle overrides, timers, listeners, and `fetch` moved into reactive
  controllers ([[controllers-without-lifecycles]]).
- Component classes end in `Element` (`lit-robust/require-element-suffix`);
  tag names are unchanged.
- Templates interpolate only names; inline arrows became `#handler = () =>`
  fields, and per-item handlers read `data-*` attributes.
- The shared form fields of the room dialogs and the settings page are pure
  render functions in `form-fields.ts`, with labels in `room-fields.ts`.
- Every Web Awesome component is imported by the module that renders it;
  `src/index.ts` imports only `#web-components`.
- Responses and WebSocket frames are `unknown` narrowed by the guards in
  `src/types/index.ts`; a malformed response shows the network-error banner.
- Room views in `DashboardState` are a `Map`, not a `Record`.

## Wire and storage

Enum values became UPPER_SNAKE on both sides, with old spellings still
readable ([[enum-values-upper-snake]]).
