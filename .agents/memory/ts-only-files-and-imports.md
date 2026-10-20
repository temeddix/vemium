---
description: Every file is .ts (no js/mjs/cjs/jsx/tsx, configs included) and imports only .ts/.js/.mts/.mjs modules, never assets; CSS comes from HTML, JSON/SVG become .ts modules
---

The user's rule, from the Deno days and restated for Node (2026-10-12): "No
JS, not even JSX/TSX, only TS." Source, scripts, tests, and configs are all
plain `.ts`. Build output in a gitignored folder is the only JS.

`tsconfig.json`: no `allowJs`, no `jsx`. Every repo turns on exactly this
strictness set (user decision, 2026-10-18): `strict`,
`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`,
`noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly`,
and `allowUnreachableCode` and `allowUnusedLabels` both set to `false` (user
decision, 2026-10-18: unreachable code and unused labels are errors, as they
were under Deno), plus the mechanical `verbatimModuleSyntax`, `allowImportingTsExtensions`, and
`noEmit`. No `"types"` field and `lib` `["es2024", "dom", "dom.iterable"]`:
the frontend is browser code and the backend is Rust. Never
`exactOptionalPropertyTypes`: an optional key may be written with a value
that is possibly `undefined`. If a tool or framework seems to need a JS or
TSX file, stop and flag it instead of adding one.

## No asset imports (2026-10-16, widened 2026-10-17)

`project/no-asset-imports` (in `scripts/project-lint.ts`) fails:

- a relative, absolute, `#`, or package-subpath specifier whose last segment
  has an extension other than `.ts`, `.js`, `.mts`, or `.mjs`: `.css`,
  `.json`, `.svg`, `.jsx`, `.tsx`, `.cjs`, `.cts`, and every other asset;
- any `?query` suffix (`?raw`, `?url`, `?inline`);
- any import attributes (`with { type: "json" }`, `with { type: "text" }`).

`.js`, `.mts`, and `.mjs` are allowed (user decision, 2026-10-17) for package
subpaths such as `lit/decorators.js`, Web Awesome components,; our own files are still `.ts` only. `.jsx`
and `.tsx` stay banned. Bare packages (`lit`, `@types/json-schema`,
`lodash.debounce`), `#` aliases, and `node:` builtins pass.
`@fortawesome/x/svgs/a.svg` fails.

```ts
import "./theme.css";                                  // no
import data from "./scenes.json" with { type: "json" }; // no
import icon from "./lock.svg?raw";                     // no
import { scenes } from "#data/scenes";                 // yes: scenes.ts
```

## What to do instead

- **CSS:** load it from HTML with `<link rel="stylesheet" href="...">`. Never
  import CSS from TS, not even for Vite. (This also removes most of the
  `import/no-unassigned-import` hits the `suspicious` category reports.)
- **JSON data:** turn it into a `.ts` module exporting a typed constant.
- **SVG:** a `.ts` module exporting a Lit template. vemium has none; icons
  are Web Awesome's by name (`<wa-icon name="folder">`).
- **`package.json` fields at runtime:** never `import pkg from
  "./package.json"` and there is no `#package` alias. Write the value out in
  `.ts` and add a test in `tests/` that reads `package.json` with `node:fs`
  and fails on drift.
- **Reading a file is not importing it.** `readFileSync` + `JSON.parse` is
  fine in tooling and tests.
- **A tool's entry:** prefer the package entry over a `.js` subpath, or
  spawn the package's bin ([[lit-analyzer-ts6]]).
