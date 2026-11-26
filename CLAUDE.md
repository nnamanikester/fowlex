# Fowlex

## Commits and pull requests

Never attribute work to AI, Claude or any other assistant or tool:

- No `Co-Authored-By` trailers (or any other AI or assistant credit) in commit messages.
- No "Generated with Claude Code" (or similar) lines, AI badges or tool credits in pull request titles,
  descriptions or comments.

Commits and PRs read as the author's own work.

## Tests

Every change ships with tests, and CI (`.github/workflows/ci.yml`) runs all of them on every pull
request; a PR can't merge until both jobs pass.

- Logic (`src/lib`, `src/models`, `src/app/api`, `src/proxy.ts`) gets unit tests (Vitest), against
  the in-memory MongoDB (`src/test/db.ts`) where data is involved. Coverage must stay above the
  thresholds in `vitest.config.mts`; don't lower them to make a change pass.
- Pages and flows get e2e tests (Playwright, `e2e/`), on desktop and phone, failing on any console
  error. Add the plan step's own check as a test.
- Run `yarn lint`, `yarn typecheck`, `yarn test --coverage` and `yarn e2e` before opening a PR.
