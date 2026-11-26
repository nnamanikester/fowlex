import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for whole flows, against a fresh in-memory MongoDB seeded by e2e/server.mts with
 * an owner, a manager and a staff member (e2e/users.ts).
 *
 *   yarn e2e        # starts the app, runs headless
 *   yarn e2e --ui   # watch it
 */
const APP_PORT = 3108;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Signs in as the owner once; the other projects start signed in.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "playwright/.auth/owner.json" },
      dependencies: ["setup"],
    },
    // Staff log daily numbers from their phones, so every flow must work at phone width.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], storageState: "playwright/.auth/owner.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // CI tests a production build; locally the dev server is quicker to start.
    // e2e/server.mts starts an in-memory MongoDB, seeds one person per role, then runs the app on it.
    command: `npx tsx e2e/server.mts -- ${process.env.CI ? `sh -c "yarn build && npx next start --port ${APP_PORT}"` : `npx next dev --port ${APP_PORT}`}`,
    port: APP_PORT,
    // Hides the dev-only Next.js badge, which covers the phone tab bar's More button.
    env: { PLAYWRIGHT: "1" },
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
