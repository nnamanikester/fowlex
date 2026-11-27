import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

const lagos = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(Date.now() + offset * 86_400_000));

test("a due vaccination uses the vaccine in stock: the vial comes off stock and onto the batch's costs", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  const vaccine = await (
    await page.request.post("/api/inventory/items", {
      data: { name: `Newcastle Lasota ${tag}`, category: "vaccine", unit: "vial" },
    })
  ).json();
  await page.request.post("/api/inventory/movements", {
    data: { itemId: vaccine.id, type: "opening", quantity: 10, unitCostKobo: 450_000, date: lagos(-8) },
  });
  const house = await (
    await page.request.post("/api/houses", { data: { name: `Vax house ${tag}`, capacity: 5000 } })
  ).json();
  const batch = await (
    await page.request.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: lagos(-7),
        breed: "Ross 308",
        delivered: 500,
        pricePerChickKobo: 0,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();

  await page.goto(`/batches/${batch.id}?tab=health`);
  await page.getByRole("main").getByRole("button", { name: "Record Newcastle (Lasota or B1)" }).click();
  const sheet = page.getByRole("dialog", { name: "Record health" });
  await expect(sheet.getByRole("radio", { name: "From your stock" })).toBeChecked();
  // Other runs may have stocked a Newcastle vaccine too: use this one.
  await sheet.getByLabel("Item").selectOption(vaccine.id);
  await expect(sheet.getByText("10 vials left")).toBeVisible();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Newcastle Lasota ${tag} recorded.`)).toBeVisible();

  await page.getByRole("navigation", { name: "Batch sections" }).getByRole("link", { name: "Costs" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: new RegExp(`Newcastle Lasota ${tag}`) })).toContainText(
    "1 vial",
  );
  await page.goto(`/inventory/${vaccine.id}`);
  await expect(page.getByRole("main").getByText("9 vials").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a low-stock alert opens buying again, from the last supplier at the last price", async ({ page }, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  const supplier = await (
    await page.request.post("/api/suppliers", { data: { name: `Feed mill ${tag}`, supplies: ["feed"] } })
  ).json();
  const item = await (
    await page.request.post("/api/inventory/items", {
      data: { name: `Grower ${tag}`, category: "feed", unit: "bag", unitKg: 25, reorderLevel: 10 },
    })
  ).json();
  await page.request.post("/api/expenses", {
    data: {
      supplierId: supplier.id,
      lines: [{ itemId: item.id, quantity: 12, unitCostKobo: 1_800_000 }],
      method: "cash",
    },
  });
  await page.request.post("/api/inventory/movements", { data: { itemId: item.id, type: "usage", quantity: 5 } });

  await page.goto("/");
  await page.getByRole("link", { name: new RegExp(`Grower ${tag}`) }).click();
  const sheet = page.getByRole("dialog", { name: "Spend money" });
  await expect(sheet.getByLabel("Bought from")).toHaveValue(supplier.id);
  await expect(sheet.getByLabel("Item")).toHaveValue(item.id);
  await expect(sheet.getByLabel("Price per bag")).toHaveValue("18,000.00");
  expect(errors).toEqual([]);
});
