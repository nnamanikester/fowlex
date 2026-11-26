# Fowlex

Management dashboard for Fowlex Farms: batches, inventory, expenses, payroll, customers and contracts,
Paystack invoicing, profit/loss and forecasts.

## Stack

- Next.js 16 (App Router, React 19) · TypeScript · Tailwind CSS 3
- MongoDB Atlas + Mongoose · Paystack · Resend · Vercel (hosting, Blob, Cron)
- Vitest (unit) · Playwright (e2e) · ESLint · Prettier · husky + lint-staged

Money is stored as whole kobo integers, never floats.

## Getting started

```bash
yarn install
cp .env.example .env.local   # fill in from the password manager
yarn dev                     # http://localhost:3000
```

## Scripts

| Script           | What it does                              |
| ---------------- | ----------------------------------------- |
| `yarn dev`       | Dev server                                |
| `yarn build`     | Production build                          |
| `yarn lint`      | ESLint                                    |
| `yarn typecheck` | Generate route types, then `tsc --noEmit` |
| `yarn test`      | Unit tests (Vitest)                       |
| `yarn e2e`       | End-to-end tests (Playwright)             |
| `yarn format`    | Prettier over the repo                    |

The pre-commit hook runs ESLint, Prettier and related unit tests on staged files.

## Brand

Logo files, colours and type are in [`brand/`](brand/README.md).
