import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

const lagos = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(Date.now() + offset * 86_400_000));

/** A batch of 1,000 birds and a customer of this test's own, with an active per-kg contract. */
async function setup(page: import("@playwright/test").Page, label: string, contract = true, limitKobo = 500_000_000) {
  const tag = `${label} ${Date.now().toString(36)}`;
  const house = await (
    await page.request.post("/api/houses", { data: { name: `Sales ${tag}`, capacity: 5000 } })
  ).json();
  const batch = await (
    await page.request.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: lagos(-38),
        breed: "Ross 308",
        delivered: 1000,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  const customer = await (
    await page.request.post("/api/customers", {
      data: { name: `Grill ${tag}`, type: "lounge", creditLimitKobo: limitKobo },
    })
  ).json();
  if (contract)
    await page.request.post("/api/contracts", {
      data: {
        customerId: customer.id,
        pricing: "perKg",
        priceKobo: 320_000,
        deliveryEvery: "weekly",
        termsDays: 14,
        startDate: lagos(-30),
        endDate: lagos(300),
        activate: true,
      },
    });
  return { batch, customer };
}

test("an order uses the contract's price, and delivering 200 birds lowers the batch's live count by 200", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const { batch, customer } = await setup(page, info.project.name);

  await page.goto(`/customers/${customer.id}`);
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "New order" }).click();
  const sheet = page.getByRole("dialog", { name: "New order" });
  await expect(sheet.getByText(/From their contract CON-\d{4}-\d{4}/)).toContainText("₦3,200.00 a kg");
  await sheet.getByLabel("From batch").selectOption({ label: `${batch.code} · 1,000 birds` });
  await sheet.getByLabel("Birds", { exact: true }).fill("200");
  await sheet.getByRole("button", { name: "Book order" }).click();
  await expect(page.getByText(/^SO-\d{4}-\d{4} booked for Grill /)).toBeVisible();

  const row = main.getByRole("listitem").filter({ hasText: "200 birds" });
  await expect(row).toContainText("To deliver");
  await row.getByRole("button").click();
  await page.getByRole("dialog", { name: /^SO-/ }).getByRole("button", { name: "Delivered" }).click();
  const deliver = page.getByRole("dialog", { name: /^Deliver SO-/ });
  await deliver.getByRole("button", { name: "Mark delivered" }).click();
  await expect(deliver.getByText("Weigh the birds: the price is per kg.")).toBeVisible();
  await deliver.getByLabel("Total weight (kg)").fill("440");
  await expect(deliver).toContainText("₦1,408,000.00");
  await deliver.getByRole("button", { name: "Mark delivered" }).click();
  await expect(page.getByText(/delivered: 200 birds off the farm\.$/)).toBeVisible();
  await expect(row).toContainText("Delivered");

  await page.goto(`/batches/${batch.id}`);
  await expect(main.getByText("Live birds").locator("..")).toContainText("800");
  await main.getByRole("navigation", { name: "Batch sections" }).getByRole("link", { name: "Sales" }).click();
  await expect(main).toContainText("200 birds sold so far");
  await expect(main.getByRole("listitem").filter({ hasText: customer.name })).toContainText("₦1,408,000.00");
  expect(errors).toEqual([]);
});

test("an order over the customer's limit says so, and saves only when told to", async ({ page }, info) => {
  const errors = watchErrors(page, [/status of 409/]);
  const { batch, customer } = await setup(page, `credit ${info.project.name}`, false, 100_000_000);
  await page.goto("/sales");
  await page.getByRole("main").getByRole("button", { name: "New order" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New order" });
  await sheet.getByLabel("Customer").selectOption({ label: customer.name });
  await sheet.getByRole("radio", { name: "Per bird" }).click();
  await sheet.getByLabel("Price a bird").fill("9000");
  await sheet.getByLabel("From batch").selectOption({ value: batch.id });
  await sheet.getByLabel("Birds", { exact: true }).fill("150");
  await expect(sheet.getByText(/this order takes them over it\.$/)).toBeVisible();
  await sheet.getByRole("button", { name: "Book order" }).click();
  await expect(sheet.getByRole("alert").filter({ hasText: "over their limit of ₦1,000,000.00" })).toBeVisible();
  await sheet.getByRole("button", { name: "Save anyway" }).click();
  await expect(page.getByText(/^SO-\d{4}-\d{4} booked for /)).toBeVisible();
  expect(errors).toEqual([]);
});
