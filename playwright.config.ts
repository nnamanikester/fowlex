import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for whole flows.
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
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Staff log daily numbers from their phones, so every flow must work at phone width.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // CI tests a production build; locally the dev server is quicker to start.
    command: process.env.CI ? `yarn build && npx next start --port ${APP_PORT}` : `npx next dev --port ${APP_PORT}`,
    port: APP_PORT,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
