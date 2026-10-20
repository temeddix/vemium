---
description: Every repo has AGENTS.md starting with the damem recall header; durable context lives in .agents/memory (flat, one fact per file) and .agents/skills
---

Standing convention (2026-10-12): every repo has an `AGENTS.md` whose first
lines are exactly the damem header (cunarist/damem):

```markdown
At the start of every new session, run `damem recall` in the terminal and treat
its output as the context for this repository. If the `damem` command is not
found, read [INSTALL.md](https://github.com/cunarist/damem/blob/main/INSTALL.md)
and follow it before reasoning or responding.
```

No `CLAUDE.md`, `GEMINI.md`, or other
per-agent files; `AGENTS.md` is the single entry point.

## `.agents/` layout

- `memory/*.md`: one fact per file, flat (subdirectories are not listed),
  frontmatter with a one-line `description` that states the fact. Link
  related notes with double-bracket wiki links using the file name without
  `.md`; a link to a missing note fails `damem doctor`.
- `skills/<name>/SKILL.md`: frontmatter `name` and `description` (when to use
  it), body says how. Helper scripts live next to it.
- `scratch/`: holds a `.gitignore` containing `*`.
- Every memory and `SKILL.md` stays under 8 KB.

## Keeping it right

- Update an existing note instead of adding a near-duplicate; delete notes
  that turn out wrong.
- Write a note when the user corrects something, states a preference, or
  when understanding something took reading many files.
- Run `damem doctor` before finishing and fix what it reports.
- Changing anything outside `.agents/` (source, config, `AGENTS.md`) follows
  the normal branch and PR flow ([[git-pr-workflow]]).

Below the header, vemium's `AGENTS.md` keeps its own sections (Common,
Frontend Guidelines, Backend Guidelines, Scope Guardrails); don't restructure
it.
