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
  const person = await page.request.post("/api/employees", {
    data: { name: "Oluwaseun Adebayo-Okonkwo Chukwuemeka", payType: "daily", rateKobo: 999_999_999_00 },
  });
  // A month's pay of its own, far in the past, with that long name on it.
  const run = await page.request.post("/api/payroll", {
    data: { period: `19${String(10 + (Date.now() % 90))}-${String(1 + (Date.now() % 12)).padStart(2, "0")}` },
  });
  const customer = await page.request.post("/api/customers", {
    data: {
      name: `The Extremely Long Name Grill Lounge and Suites ${Date.now().toString(36)}`,
      type: "hotel",
      creditLimitKobo: 999_999_999_00,
      email: "a-very-long-address-for-invoices@the-extremely-long-name-grill-lounge.com.ng",
    },
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
    "/people/attendance",
    `/people/${(await person.json()).id}`,
    "/payroll",
    "/balance",
    "/customers",
    "/contracts",
    "/sales",
    "/invoices",
    `/customers/${(await customer.json()).id}`,
    ...(run.ok() ? [`/payroll/${(await run.json()).id}`] : []),
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide, `${path} is ${wide}px wide on a ${width}px phone`).toBeLessThanOrEqual(width);
  }
});
