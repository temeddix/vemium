---
description: Keep TC39 standard decorators with accessor; Oxc can't lower them, so scripts/decorators.ts (esbuild Vite plugin) does; never legacy decorators
---

Applies to every repo that uses decorators (the Lit frontends).

**Decision (2026-10-16):** keep standard (TC39) decorators with `accessor`,
exactly as the Deno code had them. No legacy decorators.

```ts
@customElement("app-card")
export class AppCard extends LitElement {
  @property() accessor name = "";   // keep this form
}
```

**Gotcha, verified 2026-10-16:** Vite 8's Oxc transformer parses standard
decorators but can **not** lower them, so `vp build`, `vp dev`, and `vp test`
emit decorator syntax browsers and Node don't run. Check again on each Vite+
upgrade; when Oxc can lower them, delete the plugin and the `esbuild`
devDependency.

**Fix in use:** `scripts/decorators.ts`, a small Vite plugin backed by
`esbuild` (devDependency), registered in `vite.config.ts` `plugins` so it
covers build, dev server, and Vitest alike:

- `enforce: "pre"`, so it runs before Oxc;
- transforms only `.ts` modules whose source contains `@`;
- `esbuild.transform(code, { loader: "ts", target: "es2022", sourcemap,
  sourcefile: id })`, returning `{ code, map }`.

It is tooling under `scripts/`: no tests, and it must pass every lint rule.

**The options as presented to the user:**

| Option | What | Why not |
| --- | --- | --- |
| A | Legacy decorators: two tsconfig flags (`experimentalDecorators`, ...) and a codemod removing `accessor` | the user ruled out legacy decorators |
| B | Wait for Oxc to lower `accessor` decorators | not available yet; blocks the migration |
| C | No decorators: `static properties = {...}` + `declare` fields | rewrites every component |
| D | A transform step in the Vite build | chosen, with esbuild as the transformer (above) |

Don't add `experimentalDecorators` to `tsconfig.json`, and don't strip
`accessor` from fields.
