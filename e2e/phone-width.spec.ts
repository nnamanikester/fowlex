import { expect, test } from "@playwright/test";

/**
 * Nothing on a page may be wider than the phone: if it is, the phone zooms the whole page out and
 * taps land on the wrong thing. Checked on the pages with the most money and longest names.
 */
test("pages fit the phone's width, whatever the amounts and names", async ({ page, isMobile }) => {
  test.skip(!isMobile, "A phone check");
  // A big amount and a long name, so the check means something on an empty farm too.
  await page.request.post("/api/expenses", {
    data: {
      category: "repairs",
      amountKobo: 999_999_999_00,
      description: "A very long description of a repair to the borehole pump and the generator house roof",
      method: "cash",
    },
  });
  await page.request.post("/api/employees", {
    data: { name: "Oluwaseun Adebayo-Okonkwo Chukwuemeka", payType: "monthly", rateKobo: 999_999_999_00 },
  });
  const width = page.viewportSize()!.width;
  for (const path of [
    "/",
    "/expenses",
    "/expenses/categories",
    "/inventory",
    "/inventory/equipment",
    "/suppliers",
    "/batches",
    "/log",
    "/people",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide, `${path} is ${wide}px wide on a ${width}px phone`).toBeLessThanOrEqual(width);
  }
});
