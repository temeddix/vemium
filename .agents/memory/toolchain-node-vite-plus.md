---
description: Node.js (no engines in apps; images pin 24) with Vite+ (vp) and npm; only package.json, tsconfig.json, vite.config.ts plus a committed package-lock.json
---

## The stack

- **Runtime:** Node.js. App repos have no `engines` field (user decision
  2026-10-18): the container or runner image decides the version, so the
  Containerfile base image (`node:24-alpine`) and CI's `node-version: "24"`
  are the pins. `npm run lit-check` runs
  `node scripts/lit-check.ts`, which needs Node 22.18+ (unflagged type
  stripping and `module.registerHooks`); Node 24 satisfies it. Without
  `engines` or a `.node-version`, local `vp` uses its default Node
  (`vp env default`).
- **Bun is not supported** (dropped 2026-10-15). No Bun CI legs, docs, or
  runtime branches. Oxlint's `RuleTester` refuses to run under Bun anyway, and
  `vp` brings its own Node, the way uv brings its own Python.
- **Toolchain:** Vite+ (`vite-plus` devDependency, command `vp`): Vite,
  Vitest, Oxlint, Oxfmt, type checking, tsdown.
- **Package manager:** npm everywhere. `package-lock.json` is committed in
  apps *and* libraries (user agreed 2026-10-14: `npm ci` needs it). There is no
  `packageManager` field; Vite+ detects npm from the lockfile.

Deno is gone for good: never reintroduce `deno.json`, `deno.lock`, `Deno.*`
APIs, `jsr:` or `npm:` import specifiers, `mod.ts` entries, or `deno task`.

## Config files

Exactly three, plus the lockfile: `package.json`, `tsconfig.json`,
`vite.config.ts`. No `.oxlintrc.json`, `.prettierrc`, `eslint.config.*`,
`vitest.config.*`, `.npmrc`, or `tsdown.config.*`. Tool options go into
`vite.config.ts` keys (`lint`, `fmt`, `test`, `pack`) or, when a tool only
reads `package.json`, into a `package.json` key.
The target is a short `vite.config.ts`, around 30 lines (not strict).

## Commands

| Command              | Does                                                        |
| -------------------- | ----------------------------------------------------------- |
| `vp check`           | format check, Oxlint (type-aware), and type check together  |
| `vp check --fix`     | the same, applying formatting and safe fixes                |
| `vp test`            | Vitest; `vp test tests` runs only the top-level `tests/`    |
| `vp build`           | Vite production build (apps)                                |
| `vp dev`             | Vite dev server (apps)                                      |
| `npm ci` / `npm install` | install; never another package manager                  |

`vp check`, `vp test`, `npm run lit-check`, and `vp build` must all pass
before any push. CI installs the toolchain with `voidzero-dev/setup-vp`.

## Gotchas

- Oxfmt sorts `package.json` keys with its standard order; accept it and
  never set `fmt.sortPackageJson: false` ([[package-json-shape]]).
- Oxlint and Oxfmt skip what `.gitignore` lists; that is the only reason
  `node_modules/` and the built `frontend/dist/js` bundle are not linted. Keep build output gitignored.
- Vite+ bundles `vite.config.ts` itself and resolves `#` imports in it.
- Oxlint loads a `.ts` plugin file directly on Node 24 (`jsPlugins`), so
  repo-local lint plugins need no build step.
