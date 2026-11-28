import { expect, test, type Page } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

const lagos = (daysAgo = 0) => {
  const d = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date())}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

/**
 * A contract of 100 birds a week, started three weeks ago: the customer ordered 100, then 60, then
 * 100, and the farm delivered every bird ordered. The farm keeps to it; the customer doesn't.
 */
async function contractWithHistory(page: Page, tag: string) {
  const customer = await (
    await page.request.post("/api/customers", { data: { name: `Bukka ${tag}`, type: "restaurant", termsDays: 7 } })
  ).json();
  const contract = await (
    await page.request.post("/api/contracts", {
      data: {
        customerId: customer.id,
        pricing: "perBird",
        priceKobo: 700_000,
        minBirds: 100,
        minPer: "week",
        deliveryEvery: "weekly",
        termsDays: 7,
        startDate: lagos(21),
        endDate: lagos(-60),
        notes: "Delivered to the back gate",
        activate: true,
      },
    })
  ).json();
  const house = await (
    await page.request.post("/api/houses", { data: { name: `Contract ${tag}`, capacity: 5000 } })
  ).json();
  const batch = await (
    await page.request.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: lagos(45),
        breed: "Ross 308",
        delivered: 1000,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  for (const [ago, birds] of [
    [19, 100],
    [12, 60],
    [5, 100],
  ] as const) {
    const order = await (
      await page.request.post("/api/sales", {
        data: {
          customerId: customer.id,
          deliveryDate: lagos(ago),
          lines: [
            { batchId: batch.batch?.id ?? batch.id, birds, weightGrams: 0, priceKobo: 700_000, pricing: "perBird" },
          ],
          confirm: true,
        },
      })
    ).json();
    await page.request.post(`/api/sales/${order.id}/deliver`, {
      data: { version: order.version, deliveredOn: lagos(ago), confirm: true },
    });
  }
  return { customer, contract };
}

test("a contract's page says who is keeping to it, shows the record, and reads as the agreement", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  const { contract } = await contractWithHistory(page, tag);
  await page.goto("/contracts");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`Bukka ${tag}`) })
    .click();

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: `Bukka ${tag}` })).toBeVisible();
  const sides = main.getByRole("region", { name: "Who is keeping to it" });
  await expect(sides).toContainText("We are keeping to it");
  await expect(sides).toContainText("They are ordering less than agreed");
  await expect(sides).toContainText("They ordered 40 birds under the 100 birds a week agreed, in 1 week.");

  await expect(main.getByText("Agreed minimum", { exact: true })).toBeVisible();
  await expect(main.getByText("They ordered 40 under")).toBeVisible();
  const agreement = main.getByRole("article");
  await expect(agreement).toContainText("Supply agreement");
  await expect(agreement).toContainText(contract.number);
  await expect(agreement.getByRole("listitem").filter({ hasText: "Price" })).toContainText("₦7,000 a bird");
  await expect(agreement).toContainText("Delivered to the back gate");
  expect(errors).toEqual([]);
});

test("sales asks to change an agreed contract; it changes only when an owner approves", async ({
  page,
  browser,
  isMobile,
}, info) => {
  const errors = watchErrors(page);
  const tag = `change ${info.project.name} ${Date.now().toString(36)}`;
  const { contract } = await contractWithHistory(page, tag);

  // Sales, in their own browser.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    ...(isMobile ? { viewport: page.viewportSize()! } : {}),
  });
  const sales = await context.newPage();
  const salesErrors = watchErrors(sales);
  await signInAs(sales, E2E_USERS.sales.email);
  await sales.goto(`/contracts/${contract.id}`);
  await sales.getByRole("main").getByRole("button", { name: "Change terms" }).click();
  const sheet = sales.getByRole("dialog", { name: new RegExp(contract.number) });
  await expect(sheet).toContainText("an owner approves any change before it applies");
  await sheet.getByLabel("Price a bird").fill("7500");
  await sheet.getByLabel("Why the change?").fill("Feed went up");
  await sheet.getByRole("button", { name: "Ask an owner to approve" }).click();
  await expect(
    sales.getByText(`Sent to an owner: ${contract.number} keeps its terms until they approve the change.`),
  ).toBeVisible();
  const waiting = sales.getByRole("region", { name: "A change waiting for approval" });
  await expect(waiting).toContainText("Waiting for an owner");
  await expect(waiting).toContainText("₦7,500 a bird");
  await expect(sales.getByRole("article")).toContainText("₦7,000 a bird");
  await context.close();

  // The owner approves it.
  await page.goto(`/contracts/${contract.id}`);
  const ask = page.getByRole("region", { name: "A change waiting for approval" });
  await expect(ask).toContainText(`${E2E_USERS.sales.name} asked to change a term`);
  await expect(ask).toContainText("Feed went up");
  await ask.getByRole("button", { name: "Approve the change" }).click();
  await expect(page.getByText("Approved: the contract has its new terms.")).toBeVisible();
  await expect(page.getByRole("article")).toContainText("₦7,500 a bird");
  await expect(
    page.getByRole("main").getByText(`Asked by ${E2E_USERS.sales.name}, approved by ${E2E_USERS.owner.name}`),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(salesErrors).toEqual([]);
});
