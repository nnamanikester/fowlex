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
    restoreMocks: true,
    coverage: {
      provider: "v8",
      // Logic is unit-tested here; pages and components by the e2e suite (yarn e2e) on every PR.
      include: ["src/lib/**", "src/models/**", "src/app/api/**", "src/proxy.ts"],
      exclude: ["**/*.test.*"],
      reporter: ["text-summary", "text", "html", "json-summary"],
      // The floor, just under where it stands: new logic without tests fails CI.
      thresholds: { statements: 97, branches: 93, functions: 97, lines: 97 },
    },
    // Database tests start an in-memory MongoDB (the first run downloads it).
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
