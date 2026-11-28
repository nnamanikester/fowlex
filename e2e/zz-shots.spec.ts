import { test } from "@playwright/test";

// Not a test: screenshots of every page after the suite has filled them, for the alignment check.
test.skip(!process.env.SHOTS, "Only when taking screenshots");
const PAGES = [
  "/",
  "/batches",
  "/log",
  "/inventory",
  "/expenses",
  "/suppliers",
  "/people",
  "/payroll",
  "/customers",
  "/contracts",
  "/sales",
  "/invoices",
  "/balance",
  "/reports",
  "/reports?view=batches",
  "/settings",
];
test("shots", async ({ page }, info) => {
  test.setTimeout(300_000);
  for (const path of PAGES) {
    await page.goto(path);
    await page.getByRole("main").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${process.env.SHOTS}/${info.project.name}${path.replace(/\//g, "_") || "_home"}.png`,
      fullPage: true,
    });
  }
});
