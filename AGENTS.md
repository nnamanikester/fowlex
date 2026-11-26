<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commits and pull requests

Never attribute work to AI or to any assistant or tool:

- No `Co-Authored-By` trailers (or any other AI or assistant credit) in commit messages.
- No "Generated with …" lines, AI badges or tool credits in pull request titles, descriptions or comments.

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
