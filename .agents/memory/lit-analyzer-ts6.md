---
description: lit-analyzer runs from scripts/lit-check.ts, which maps "typescript" to the aliased typescript-6 devDependency; npm run lit-check in CI
---

Applies to Lit repos that ran `cunarist/deno-lit-analyzer` under Deno.

lit-analyzer is built on TypeScript's JavaScript compiler API and is run
against TypeScript 6 (the open question was whether it works with TS 7 /
tsgo). The repo installs TS 6 under another name and redirects lit-analyzer
to it, so the rest of the toolchain is unaffected (decided 2026-10-16):

```jsonc
// package.json
"scripts": { "lit-check": "node scripts/lit-check.ts" },
"devDependencies": { "typescript-6": "npm:typescript@^6", "lit-analyzer": "..." }
```

```ts
// scripts/lit-check.ts (shape)
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    // when lit-analyzer asks for "typescript", hand it TS 6
    return next(specifier === "typescript" ? "typescript-6" : specifier, context);
  },
});
// then run lit-analyzer
```

- Node runs the `.ts` script directly (type stripping), so no build step.
- The script imports the package entry (`await import("lit-analyzer")`) and
  calls its `cli()`. `project/no-asset-imports` would also accept a `.js`
  or `.mjs` package subpath, but the entry is the stable public surface; spawning the
  package's bin with `node:child_process` is the other option.
- CI runs `npm run lit-check` as its own step.
- It is tooling under `scripts/`: no tests; a narrow `overrides` entry for it
  (e.g. `no-console`) is allowed if truly needed.

Don't replace this with a global TypeScript downgrade, a second
`tsconfig`, or a `.js` wrapper script.
