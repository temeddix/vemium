---
description: Vitest via vp test; unit tests sit next to code as *.test.ts, regression/integration tests in tests/ via the public entry (through its # alias, never ../); scripts/ has no tests
---

Decided 2026-10-14.

- **Runner:** Vitest through `vp test`. Import test APIs from
  `vite-plus/test` (`describe`, `expect`, `it`).
- **Unit tests** sit next to the code: `src/foo/bar.ts` is tested in
  `src/foo/bar.test.ts`. Vitest's default include finds them.
- **Regression and integration tests** live in the top-level `tests/` folder
  and use only the public entry point, imported through its `#` alias,
  never internals and never `../`, which is banned in every file.
  `vp test tests` runs just these ([[imports-aliases-barrels]]).
- **No in-source tests** (`import.meta.vitest`).
- **`scripts/` gets no tests** (2026-10-15): it is repo tooling, not
  production code (`project-lint.ts`, `decorators.ts`, `lit-check.ts`).
- Test files follow every lint rule; no relaxed overrides for tests.

A change must keep every existing test case; a dropped case is lost coverage.
Tests must pass locally before any push.

## In vemium

The frontend has no Vitest tests, as on main (Deno had none either). CI
still runs `vp test`, and `vite.config.ts` sets
`test: { passWithNoTests: true }` so it passes until the first test lands;
Rust tests live under `backend/`. Add Vitest tests next to the code when a
change brings testable TS logic, such as the cron parser in
`cron-picker.ts`.
