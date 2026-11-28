import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("write a contract from the customer's page, keep it as a template, start the next from it, and end one early", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  const grill = await (
    await page.request.post("/api/customers", { data: { name: `Grill ${tag}`, type: "lounge", termsDays: 7 } })
  ).json();
  const suya = await (
    await page.request.post("/api/customers", { data: { name: `Suya Spot ${tag}`, type: "restaurant" } })
  ).json();

  await page.goto(`/customers/${grill.id}`);
  const main = page.getByRole("main");
  const sheet = page.getByRole("dialog", { name: "Write a contract" });
  // Under load the page can still be waking up: tap until the sheet opens.
  await expect(async () => {
    await main.getByRole("button", { name: "Write a contract" }).click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(sheet).toContainText(`For Grill ${tag}`);
  // The customer's own terms are the starting point.
  await expect(sheet.getByLabel("Days to pay each invoice")).toHaveValue("7");
  await sheet.getByRole("button", { name: "Make it active" }).click();
  await expect(sheet.getByText("Enter the agreed price.")).toBeVisible();

  await sheet.getByLabel("Price a kg").fill("3200");
  await sheet.getByRole("button", { name: "6 months", exact: true }).click();
  await sheet.getByLabel("The fewest birds they take").fill("200");
  await sheet.getByLabel("Deliveries").selectOption("weekly");
  await sheet.locator('input[type="file"]').setInputFiles({
    name: "signed.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 signed"),
  });
  await sheet.getByRole("switch", { name: "Keep these terms as a template" }).click();
  await sheet.getByLabel("Template name").fill(`Lounges ${tag}`);
  await sheet.getByRole("button", { name: "Make it active" }).click();
  await expect(page.getByText(/^CON-\d{4}-\d{4} is active: Grill .*'s orders use its price\.$/)).toBeVisible();

  const row = main.getByRole("listitem").filter({ hasText: "₦3,200.00" });
  await expect(row).toContainText("Active");
  // Its own page: the agreement as signed, with the signed copy.
  await row.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: new RegExp(`Grill ${tag}`) })).toBeVisible();
  await expect(main.getByRole("link", { name: /signed\.pdf/ })).toBeVisible();
  await main.getByRole("button", { name: "Change terms" }).click();
  const open = page.getByRole("dialog", { name: new RegExp(`Grill ${tag}`) });
  await expect(open).toContainText("Running:");
  await open.getByRole("button", { name: "End it early" }).click();
  await page
    .getByRole("dialog", { name: /^End CON-/ })
    .getByRole("button", { name: "End contract" })
    .click();
  await expect(page.getByText(/^CON-\d{4}-\d{4} has ended\.$/)).toBeVisible();
  await expect(main.getByText("Ended early").first()).toBeVisible();

  // The next contract starts from the template.
  await page.goto("/contracts");
  await main.getByRole("button", { name: "Write a contract" }).first().click();
  const next = page.getByRole("dialog", { name: "Write a contract" });
  await next.getByLabel("Customer").selectOption({ label: `Suya Spot ${tag}` });
  await next.getByRole("button", { name: new RegExp(`Lounges ${tag}`) }).click();
  await expect(next.getByLabel("Price a kg")).toHaveValue("3,200.00");
  await expect(next.getByLabel("The fewest birds they take")).toHaveValue("200");
  await expect(next.getByRole("button", { name: "6 months", exact: true })).toHaveAttribute("aria-pressed", "true");
  await next.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText(/saved as a draft\.$/)).toBeVisible();
  await expect(main.getByRole("listitem").filter({ hasText: `Suya Spot ${tag}` })).toContainText("Draft");
  expect(suya.id).toBeTruthy();
  expect(errors).toEqual([]);
});

test("a second active contract over the same days is refused, saying which one runs", async ({ page }, info) => {
  const errors = watchErrors(page, [/status of 409/]);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  const c = await (await page.request.post("/api/customers", { data: { name: `Hotel ${tag}`, type: "hotel" } })).json();
  const terms = { customerId: c.id, pricing: "perBird", priceKobo: 850_000, deliveryEvery: "weekly", termsDays: 7 };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  const year = Number(today.slice(0, 4));
  await page.request.post("/api/contracts", {
    data: { ...terms, startDate: today, endDate: `${year + 1}-12-31`, activate: true },
  });
  await page.goto(`/customers/${c.id}`);
  await page.getByRole("main").getByRole("button", { name: "Write a contract" }).click();
  const sheet = page.getByRole("dialog", { name: "Write a contract" });
  await sheet.getByRole("radio", { name: "Per bird" }).click();
  await sheet.getByLabel("Price a bird").fill("9000");
  await sheet.getByRole("button", { name: "Make it active" }).click();
  await expect(
    sheet
      .getByRole("alert")
      .filter({ hasText: /already runs from/ })
      .first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
