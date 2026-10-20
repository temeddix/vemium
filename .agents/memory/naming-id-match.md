---
description: Deno's camelcase is Oxlint id-match ^_*[^_]*_*$|^[^a-z]*$; leading _ for unused vars; rename snake_case imports; PascalCase types; single-letter type params
---

Oxlint has no `camelcase`. Its built-in `id-match` replaces it, set in
`configs.project` (user decision 2026-10-16, replacing a ~400-line port):

```ts
"id-match": ["error", "^_*[^_]*_*$|^[^a-z]*$", {
  properties: true, classFields: false, onlyDeclarations: false,
  ignoreDestructuring: true,
}],
```

**Meaning** (Deno's `is_underscored`): after trimming leading and trailing
underscores, the name has no `_`, **or** the name has no lowercase ASCII
letter. `id-match` can't tell what kind of name it sees, so one regex accepts
every valid style; other rules decide which style goes where.

```ts
const userName = 1;       // ok
class UserStore {}        // ok here; pascal-case-types enforces PascalCase
const MAX_SIZE = 10;      // ok: no lowercase, so UPPER_SNAKE passes
const _unused = 1;        // ok: leading _ marks an unused binding
const user_name = 1;      // error
```

- **Leading underscores stay allowed** for unused parameters and variables
  (`items.map((_item, index) => index)`). The user considered banning them and
  kept them for exactly this.
- **Rename snake_case imports at the import** (user wants this flagged):
  `import { parse_args as parseArgs } from "some-lib";`
- `declare` lines and snake_case globals are rare and accepted as they are.
- **Types:** classes, interfaces, type aliases, enums are PascalCase
  (`pascal-case-types` from explicit-types' `naming` config); string-union
  members are UPPER_SNAKE_CASE; no `enum`.
- **Type parameters:** the user wants single capital letters (`T`, `K`), not
  `Item`; write new code that way.
- No autofix exists for `id-match`; rename by hand.

`properties: true` also checks object-literal keys and getter names, as
Deno's `camelcase` did ([[app-repo-specific-decisions]]).

**Known differences from Deno's `camelcase`** (against its 130 test cases):
it misses 9 (unquoted object keys like `{ bar_baz: 1 }` and `{ bar_baz }`,
shorthand destructuring in parameters, `{ a_b: a_b }`,
`{ foo: bar_baz = 1 }`) and over-reports 17 (non-renamed imports, assignments
to unresolved globals, 11 ambient `declare` cases). Beyond Deno it also checks
type parameters, interface and type-literal members, class methods, and
labels. The user accepted these differences.
