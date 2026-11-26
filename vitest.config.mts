import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // "server-only" throws outside React Server Components; in tests every module is server-side.
    alias: { "server-only": new URL("./src/test/empty.ts", import.meta.url).pathname },
  },
  test: {
    // Most tests are pure logic (money, KPIs, forecasts). Component tests opt in to jsdom
    // with a `// @vitest-environment jsdom` comment at the top of the file.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    clearMocks: true,
    // Database tests start an in-memory MongoDB (the first run downloads it).
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
