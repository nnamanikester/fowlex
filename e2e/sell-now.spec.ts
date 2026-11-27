import { expect, test, type Page } from "@playwright/test";

import { watchErrors } from "./helpers";

/** Birds to sell: a batch of this test's own, 40 days old. */
async function birds(page: Page, label: string) {
  const tag = `${label} ${Date.now().toString(36)}`;
  const house = await (
    await page.request.post("/api/houses", { data: { name: `Counter ${tag}`, capacity: 5000 } })
  ).json();
  await page.request.post("/api/batches", {
    data: {
      houseId: house.id,
      placedOn: new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10),
      breed: "Ross 308",
      delivered: 200,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
      confirm: true,
    },
  });
}

async function openSellNow(page: Page) {
  await page.goto("/sales");
  const sheet = page.getByRole("dialog", { name: "Sell now" });
  await expect(async () => {
    await page.getByRole("main").getByRole("button", { name: "Sell now" }).first().click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  return sheet;
}

test("sell two birds to someone with no details, for cash, in one step", async ({ page }, info) => {
  const errors = watchErrors(page);
  await birds(page, info.project.name);
  const sheet = await openSellNow(page);
  await sheet.getByRole("button", { name: "One bird more" }).click();
  await sheet.getByRole("radio", { name: "Per bird" }).click();
  // A price per bird must be typed the first time.
  await sheet.getByLabel("Price a bird").fill("7000");
  await sheet.getByRole("radio", { name: /Cash now/ }).click();
  await expect(sheet).toContainText("₦14,000");
  await sheet.getByRole("button", { name: "Sold: ₦14,000 cash" }).click();
  await expect(page.getByText("Sold 2 birds for ₦14,000, paid in cash.")).toBeVisible();

  await page.goto("/invoices");
  await page.getByRole("radio", { name: "Paid", exact: true }).click();
  await expect(
    page.getByRole("main").getByRole("listitem").filter({ hasText: "Walk-in customers" }).first(),
  ).toContainText("Paid");
  expect(errors).toEqual([]);
});

test("a buyer pays by transfer to an account made for the sale, and it turns paid by itself", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  await birds(page, `transfer ${info.project.name}`);
  const sheet = await openSellNow(page);
  await sheet.getByRole("radio", { name: "Per kg" }).click();
  await sheet.getByLabel("They weigh (kg)").fill("2.2");
  await sheet.getByLabel("Price a kg").fill("3200");
  await sheet.getByRole("radio", { name: /Transfer now/ }).click();
  await sheet.getByRole("button", { name: "Get an account to pay into" }).click();

  const pay = page.getByRole("dialog", { name: "Pay by transfer" });
  await expect(pay).toContainText("Transfer exactly");
  await expect(pay).toContainText("₦7,040");
  await expect(pay).toContainText("Paystack-Titan");
  await expect(pay.getByRole("button", { name: "Copy the account number" })).toBeVisible();
  await expect(pay.getByText(/Waiting for the money/)).toBeVisible();
  await pay.getByRole("button", { name: "They've paid (test money)" }).click();
  await expect(pay.getByText(/came in for INV-/)).toBeVisible({ timeout: 15_000 });
  // The sheet closes by itself a moment later, while the page refreshes.
  await expect(page.getByText(/^Paid by transfer: ₦7,040 for INV-/)).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("a pay-later sale is paid by transfer from its invoice", async ({ page }, info) => {
  const errors = watchErrors(page);
  await birds(page, `later ${info.project.name}`);
  const sheet = await openSellNow(page);
  await sheet.getByRole("radio", { name: "Per bird" }).click();
  await sheet.getByLabel("Price a bird").fill("6500");
  await sheet.getByRole("radio", { name: /Pay later/ }).click();
  await sheet.getByRole("button", { name: "Add their name or phone (optional)" }).click();
  await sheet.getByLabel("Their name").fill("Mama Nkechi");
  await sheet.getByRole("button", { name: "Sold: they'll pay later" }).click();
  const toast = page.getByText(/^Sold 1 bird for ₦6,500: INV-\d{4}-\d{4} is waiting to be paid\.$/);
  await expect(toast).toBeVisible();
  const number = /INV-\d{4}-\d{4}/.exec((await toast.textContent())!)![0];

  await page.goto("/invoices");
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(number) })
    .click();
  const invoice = page.getByRole("dialog", { name: number });
  await invoice.getByRole("button", { name: "Pay by transfer" }).click();
  const pay = page.getByRole("dialog", { name: "Pay by transfer" });
  await expect(pay).toContainText("₦6,500");
  await pay.getByRole("button", { name: "They've paid (test money)" }).click();
  await expect(page.getByText(`Paid by transfer: ₦6,500.00 for ${number}.`)).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
