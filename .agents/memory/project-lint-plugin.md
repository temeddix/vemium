---
description: scripts/project-lint.ts is the repo-local plugin "project" holding the repo's rule list (typed DummyRuleMap) and its custom rules in one file; never published, no tests
---

Every repo has `scripts/project-lint.ts`, copied from
`cunarist/eslint-plugin-explicit-types` and extended. It is a repo-local
Oxlint plugin with `meta.name` `"project"`, loaded through `jsPlugins` in
`vite.config.ts`. It holds:

- **`configs.project.rules`**: the repo's whole rule list beyond the published
  plugin configs: Deno parity rules, extras, per-rule options, and opt-outs,
  built-in Oxlint ids included (`curly`, `id-match`, `import/no-cycle`, ...).
- **Custom rules**, enabled as `project/<rule>`. Every repo has
  `no-disable-comments` and `no-asset-imports`. vemium had no custom Deno
  plugin, so the rest are Deno's `prefer-ascii` and the `@hugoalh` ports.

`scripts/project-lint.ts` holds the plugin object, the rule list, and the
rules themselves in one file; it is not split for size (2026-10-17). `scripts/` stays flat: no `scripts/rules/`, no
`index.ts`.

```ts
import type { DummyRuleMap } from "vite-plus/lint";

const rules: DummyRuleMap = {
  "id-match": ["error", "^_*[^_]*_*$|^[^a-z]*$", { /* ... */ }],
  curly: "error",
  "project/no-disable-comments": "error",
};

const plugin = {
  meta: { name: "project" },
  rules: { "no-disable-comments": noDisableCommentsRule, /* ... */ },
  configs: { project: { rules } },
};
export default plugin;
```

## Why `DummyRuleMap` and an unannotated plugin (decided 2026-10-15)

- `DummyRuleMap` (re-exported by `vite-plus/lint`) is Oxlint's type for
  `OxlintConfig.rules`. Despite the name it lists every built-in rule with its
  options, so a typo in a rule id or option is a type error, not just a CI
  failure. Without it, TypeScript widens `"error"` to `string`; `as const`
  doesn't help because Oxlint wants mutable tuples.
- `@eslint/core`'s `Plugin` is too loose to read back: `configs` is optional,
  any key may be missing, and a config may be an array, so
  `projectLint.configs.project.rules` fails in `vite.config.ts` (and `!` is
  banned). Optional chaining still leaves the array case.
- Oxlint's own `Plugin` type (`vite-plus/lint/plugins`) has no `configs`.
- Two hand-written interfaces worked but were dropped as noise; a plain
  config object was rejected because custom rules need the plugin form anyway
  and every repo should look the same.

`scripts/` is tooling, not production code: never packed or published, and
no tests. Its Node-code offs are the first `projectOverrides` entry; see
[[lint-config]].

## In vemium

`frontend/scripts/project-lint.ts` exports the plugin both as the named
`projectLint` and as default, and `vite.config.ts` imports it directly as
`./scripts/project-lint.ts`, which holds every rule in one file
([[app-repo-specific-decisions]]).
