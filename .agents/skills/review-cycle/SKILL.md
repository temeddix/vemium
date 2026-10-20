---
name: review-cycle
description: After opening a PR, run review rounds until fully approved; @bot on Capsulizers Gitea repos, an adversarial subagent review posted as a PR comment elsewhere; then hand to the user, never merge
---

Every PR gets reviewed before the user sees it. Repeat rounds until the
review is a full approval (cap: 6 rounds; if still not approved, stop and
report what remains). Never approve to finish early, and never merge.

## Capsulizers repos (git.capsulizers.com) with `.gitea/workflows/agents.yml`

1. Comment `@bot` on the PR through the Gitea API, as the user's own account
   (credentials from the user's environment, sourced in a subshell, never
   printed).
2. Wait for the review from the `bot` account (poll about every 2 minutes,
   up to about 30 minutes per round).
3. For each point: fix valid ones with commits on the PR branch; reply
   briefly with reasons to ones that are wrong.
4. Re-run `vp check`, the build, and `vp test`, push, and comment `@bot`
   again. Done when the bot approves.

## Other repos (GitHub, or Gitea without the bot)

1. Have a separate subagent review the **full PR diff** adversarially:
   correctness, behavior changes, missed Deno APIs, broken build paths, lint
   parity, and violations of the repo's `.agents/memory` rules.
2. Post the review as a PR comment headed `Automated review (round N)`,
   ending with exactly one verdict line: `VERDICT: APPROVED` or
   `VERDICT: CHANGES REQUESTED`.
3. Address every point with commits, re-run checks, push, and reply to the
   review comment summarizing the fixes.
4. Next round reviews from scratch, not just the fixes. Done when a round's
   verdict is `APPROVED`.

## After approval

- Ask the user to review (or, when the user is away, list the PR and any open
  questions in the report and the questions file). Don't wait idle.
- The user merges (squash). Don't merge even after approval unless the user
  explicitly allowed it for this PR.
