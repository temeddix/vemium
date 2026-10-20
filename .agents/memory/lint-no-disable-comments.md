---
description: Every eslint-/oxlint-disable or -enable comment is banned in every form; three checks enforce it together, keep all three
---

Banned (2026-10-16): `eslint-disable`, `eslint-disable-line`,
`eslint-disable-next-line`, `eslint-enable`, and the same with `oxlint-`, as
line or block comments, anywhere in the repo. Fix the code; if the code truly
can't be fixed, ask the user, don't silence the rule. Old
`deno-lint-ignore` lines are removed during the migration and their cause
fixed.

Oxlint (1.87) has no `noInlineConfig` and no `eslint-comments` rules, and
`respectEslintDisableDirectives: false` only ignores `eslint-*` directives. So
three checks enforce the ban together, and none is redundant:

1. `project/no-disable-comments` (custom, in `scripts/project-lint.ts`) fails
   any directive.
2. `unicorn/no-abusive-eslint-disable` fails a directive that names no rule,
   which would otherwise silence the custom rule on its own line.
3. `options.reportUnusedDisableDirectives: "error"` fails a directive naming
   `project/no-disable-comments` (the custom rule skips that one, so the
   directive silences nothing and is reported as unused).

Every form was probed and fails `vp check`.

A rule that fires on legitimate code is a rule problem: change the rule or its
options in `configs.project` with the user's agreement, not the call site.
Known example: rule records are `Map`s keyed by id rather than object
literals with kebab-case keys, which keeps naming rules happy without any
directive.
