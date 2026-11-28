import { expect, test, type Page } from "@playwright/test";

import { watchErrors } from "./helpers";

/** A bill to pay later: 1 bird at ₦7,000 to a walk-in, from a batch of this test's own. */
async function bill(page: Page, tag: string) {
  const house = await (await page.request.post("/api/houses", { data: { name: `Pay ${tag}`, capacity: 5000 } })).json();
  await page.request.post("/api/batches", {
    data: {
      houseId: house.id,
      placedOn: new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10),
      breed: "Ross 308",
      delivered: 50,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
      confirm: true,
    },
  });
  const { invoice } = await (
    await page.request.post("/api/sales/quick", {
      data: { birds: 1, pricing: "perBird", priceKobo: 700_000, paidBy: "later" },
    })
  ).json();
  return invoice as { id: string; number: string };
}

test("send a pay link; the customer pays by card through Paystack and sees it paid", async ({
  page,
  browser,
  isMobile,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  const invoice = await bill(page, tag);

  // From the invoice: the link is copied, ready to paste into WhatsApp.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined }));
  await page.goto("/invoices");
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(invoice.number) })
    .click();
  await page
    .getByRole("dialog", { name: new RegExp(invoice.number) })
    .getByRole("button", { name: "Send pay link" })
    .click();
  await expect(page.getByText("Pay link copied: paste it to the customer.")).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/pay\/[\w-]{20,}$/);

  // The customer, signed in to nothing.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    ...(isMobile ? { viewport: page.viewportSize()! } : {}),
  });
  const buyer = await context.newPage();
  const buyerErrors = watchErrors(buyer);
  await buyer.goto(link);
  await expect(buyer.getByRole("heading", { level: 1, name: "₦7,000" })).toBeVisible();
  await expect(buyer.getByText(invoice.number)).toBeVisible();
  await buyer.getByRole("button", { name: "What it's for" }).click();
  await expect(buyer.getByText(/1 bird/).first()).toBeVisible();
  await buyer.getByRole("button", { name: "Pay ₦7,000" }).click();
  await expect(buyer.getByText("Paystack test checkout")).toBeVisible();
  await buyer.getByRole("button", { name: "Pay with test card" }).click();
  await expect(buyer.getByRole("heading", { name: "Paid. Thank you" })).toBeVisible();
  await expect(buyer.getByRole("button", { name: /^Pay ₦/ })).toHaveCount(0);
  await context.close();

  // The farm sees it paid, and what Paystack kept.
  await page.goto("/invoices");
  await page.getByRole("radio", { name: "Paid", exact: true }).click();
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: invoice.number })).toContainText("Paid");
  await page.goto("/expenses");
  await expect(page.getByText(`Paystack fee for taking ${invoice.number}`).first()).toBeVisible();
  expect(errors).toEqual([]);
  expect(buyerErrors).toEqual([]);
});

test("the customer pays a pay link by bank transfer instead", async ({ page, browser, isMobile }, info) => {
  const tag = `transfer ${info.project.name} ${Date.now().toString(36)}`;
  const invoice = await bill(page, tag);
  const { url } = await (await page.request.post(`/api/invoices/${invoice.id}/pay-link`)).json();
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    ...(isMobile ? { viewport: page.viewportSize()! } : {}),
  });
  const buyer = await context.newPage();
  const errors = watchErrors(buyer);
  await buyer.goto(url);
  await buyer.getByRole("button", { name: "Get an account number" }).click();
  await expect(buyer.getByText("Transfer exactly")).toBeVisible();
  await buyer.getByRole("button", { name: "They've paid (test money)" }).click();
  await expect(buyer.getByRole("heading", { name: "Paid. Thank you" })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
  await context.close();
});
