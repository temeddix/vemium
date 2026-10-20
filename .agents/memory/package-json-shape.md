---
description: package.json follows Oxfmt's standard key order (no sortPackageJson override); standard fields only; no peerDependencies or packageManager
---

## Key order (2026-10-16)

Oxfmt sorts `package.json` into its standard order, and that order is
accepted: `vite.config.ts` never sets `fmt: { sortPackageJson: false }`, and
nobody keeps a hand-written order. `vp check --fix` applies it.

The order of entries *inside* `imports` can still carry meaning:
the modules plugin's `enforce-layer-order` reads it as the layer order. Oxfmt
leaves entry order alone; never reorder them casually.

## Fields

- **Standard fields only.** App repos have no `engines` field (user decision
  2026-10-18; images pin Node, [[toolchain-node-vite-plus]]). 
- **No `packageManager`.** npm is detected from `package-lock.json`.
- **No `peerDependencies`, ever** (user preference, 2026-10-14). If something
  is needed at runtime, it goes in `dependencies`.
- **`dependencies`** = what ships in the app bundle (`lit`, Web Awesome,
  charts).
- **`devDependencies`** = everything else: `vite-plus`, the
  `eslint-plugin-*` packages, `esbuild`, `lit-analyzer`,
  `typescript-6`, `@types/node` (for `scripts/` only; the browser tsconfig
  never loads Node types), and type-only packages such as
  `@eslint/core` and `@typescript-eslint/types` that `scripts/` imports for
  its types.
- **The lint plugins** are listed with normal npm semver ranges, never
  `file:`, `link:`, tarball, or git specifiers.

Refresh the lockfile with `npm install` and commit it with the change.
