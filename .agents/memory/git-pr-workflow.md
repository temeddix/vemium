---
description: Work on a branch, plain imperative commits without AI trailers, one PR with the Claude Code footer, review until approved, never merge yourself; squash only
---

## Branches and commits

- Never push to `main`. Every change goes through a branch and a PR, even a
  one-line fix.
- Commit messages are plain imperative sentences ("Port the import-check
  rules to an ESLint plugin"). No conventional-commit prefixes, no AI
  trailers (`Co-Authored-By: Claude`, "Generated with ..."), no emoji.
- When several agents share a branch, each works in its own `git worktree`,
  runs `git pull --rebase` before pushing, and retries a rejected push after
  rebasing. Remove the worktree and temp branch afterwards.
- The checks in `AGENTS.md` pass locally before every push.

## Pull requests

- One PR per repo for a migration, everything included (size-rule refactors
  too).
- The body covers: summary, what changed, deviations and risks, verification
  done, and open questions. It ends with exactly this line:

  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

- Then run the review cycle (skill `review-cycle`): a subagent reviews the
  diff and posts the review as a PR comment. Repeat until fully approved,
  then ask the user to review.

## Merging

- **Never merge on your own.** The user merges, unless they explicitly allow
  it for one specific PR.
- Squash-merge only, so a PR lands as one commit titled after the PR.
- Also never, without the user: publish, archive a repo, or delete a branch
  the user may still use.
