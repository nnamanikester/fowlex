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

### Database

The app needs `MONGODB_URI`. Until Atlas is set up, run a local one in a second terminal:

```bash
yarn db    # prints the MONGODB_URI line for .env.local; data stays in .data/mongo
```

It is a single-node replica set, like Atlas, so transactions work. Unit tests start their own
in-memory MongoDB and need nothing running.

### Signing in

Set `JWT_SECRET` in `.env.local` (`openssl rand -base64 48`), then create someone to sign in as:

```bash
yarn user:create --email you@fowlex.com --name "Your Name"   # owner; prints a password once
```

Without `RESEND_API_KEY`, emails (password resets) are printed in the `yarn dev` terminal.

The e2e tests start their own in-memory MongoDB with one owner, manager and staff member
(`e2e/users.ts`) and need nothing running.

## Scripts

| Script             | What it does                              |
| ------------------ | ----------------------------------------- |
| `yarn dev`         | Dev server                                |
| `yarn build`       | Production build                          |
| `yarn lint`        | ESLint                                    |
| `yarn typecheck`   | Generate route types, then `tsc --noEmit` |
| `yarn test`        | Unit tests (Vitest)                       |
| `yarn e2e`         | End-to-end tests (Playwright)             |
| `yarn format`      | Prettier over the repo                    |
| `yarn db`          | Local MongoDB for development             |
| `yarn user:create` | Create someone who can sign in            |

The pre-commit hook runs ESLint, Prettier and related unit tests on staged files.

## Brand

Logo files, colours and type are in [`brand/`](brand/README.md).
