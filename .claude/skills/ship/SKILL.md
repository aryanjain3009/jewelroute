---
name: ship
description: Use when the human types "/ship NNN-slug" after /verify approved. Re-checks that the evidence is fresh, pushes the feature branch and opens a DRAFT pull request with a proof packet. Never merges, never deploys to production. Not for verification (/verify) or for deploying.
disable-model-invocation: true
argument-hint: "NNN-slug"
metadata:
  owner: Sushant6095
  last-verified: 2026-10-21
---

# /ship — draft PR with proof, never merge

## Done when
- `docs/features/<slug>/VERIFY.md` says APPROVE for the current HEAD (or Stage A was re-run green on it).
- The feature branch `feat/<slug>` is pushed (no force) and a **draft** PR exists. Its body contains the proof packet below.
- You replied with the PR URL. Nothing was merged, deployed with `--prod`, or published.

## Gotchas
- **Fresh evidence only.** If `git rev-parse --short HEAD` differs from the sha in VERIFY.md and the diff since then touches code (not just docs), re-run `pnpm verify` and add the new receipt. If it fails, stop: this goes back to `/build`.
- `git push --force`, `vercel --prod`, `pnpm publish` are denied in settings and by the guard hook. Do not look for a way around them.
- This repo may be on `main` with other agents committing. Branch from the feature's commits: `git switch -c feat/<slug>` if not already on one. Never rewrite shared history.
- GitHub account is `Sushant6095`. If `gh auth status` fails or there is no remote, write the PR body to `docs/features/<slug>/PR.md` and tell the human what to run. Do not invent a URL.
- The PR body ends with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)` and the session URL.

## Steps
1. Read VERIFY.md. Verdict must be APPROVE; otherwise stop and say why.
2. Compare the HEAD sha to the receipt sha. Re-run Stage A (`pnpm verify`) if code changed since then.
3. Ensure a branch: `git branch --show-current`. If on `main`, create `feat/<slug>` at HEAD.
4. Push: `git push -u origin feat/<slug>`.
5. Build the proof packet (PR body):
   ```
   ## What
   <Outcome from SPEC.md>
   ## Why
   <1–2 lines>
   ## How to test
   <critical journeys from SPEC.md as numbered steps + commands>
   ## Invariants touched
   <INV ids → test names that prove them>
   ## Migration?
   <none | folder name, expand/contract step, one-way door yes/no>
   ## Evidence
   <receipts table from VERIFY.md: command · exit · tests · sha>
   <screenshot paths from ui-verify, if UI changed>
   ## Known limits
   <from VERIFY.md / SPEC Out of scope>
   ```
6. `gh pr create --draft --title "<type>(<cluster>): <title>" --body-file <tmp file>`.
7. Append the PR URL to `progress.md` and commit it. Reply with the URL and "Review and merge when ready. /ship never merges."

## Related
- Before: `/verify` APPROVE. After merge (by the human): `/remember` anything learned.
