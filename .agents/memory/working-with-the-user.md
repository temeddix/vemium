---
description: Ask one decision at a time with a code example, follow ecosystem conventions and ask before deviating, keep config minimal, and never block when the user is away
---

## Asking

- **One question at a time.** Each decision question stands alone, with the
  options and a recommendation.
- **Show code.** The user is new to the ESLint ecosystem and asked for
  example code blocks whenever possible (2026-10-14): before/after snippets
  or config examples, not prose alone.

  ```ts
  // A. per-file override          // B. refactor with a barrel
  overrides: [{ files: [...] }]    import { a, b } from "#ui";
  ```

- **Keep answers short.** State the decision and what changed; detail belongs
  in `.agents/memory/`, not chat.
- The user often probes with "why?" and "is this the simplest form?". Have
  the reason ready, and prefer the option with fewer lines, fewer files, and
  fewer custom types when the result is equivalent.

## Conventions over invention

- Follow the ecosystem's conventions (Vite, Oxlint, Lit) and `index.ts`
  entries.
- **Any deviation is a question, not a default**, even one carried over from
  the Deno version.
- Before finishing structural work, compare against well-known projects and
  list every difference for the user.

## When the user is away

- **Never block on the user.** No approval requests, no waiting. Pick the
  conservative option consistent with these notes, write the choice and its
  reason in the PR or report, and continue. (An idle approval request once
  cost hours; the user was emphatic.)
- Log open questions where the user will look: the PR body, and the shared
  questions file the coordinator names (during the migration,
  `~/.local/share/deno-migration/morning-questions.md`).
- Prefer Oxlint built-ins over custom `project` rules whenever they cover the
  case (user, 2026-10-19).
- Hard limits still hold without asking: no merging, no publishing, no
  archiving, no pushing to `main`, no external state changes.

## Working style the user expects from agents

- Keep the main conversation free: repo edits, commits, and long checks run
  in background subagents.
- Fan independent work out to many parallel subagents (more than five when it
  splits), each in its own worktree when they share a branch.
