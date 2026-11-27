import { expect, type Page, test } from "@playwright/test";

import { watchErrors } from "./helpers";

/** A fresh house for this test's batch, so it never crowds the seeded ones. */
async function house(page: Page, label: string) {
  const res = await page.request.post("/api/houses", {
    data: { name: `${label} ${Date.now().toString(36)}`, capacity: 1000 },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const lagos = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);
};

test("a batch on day 7 shows the Newcastle vaccination as due; recording it marks it given", async ({ page }, info) => {
  const errors = watchErrors(page);
  // A batch placed 7 days ago, one per browser so each records its own dose.
  const houseId = await house(page, `Vaccine ${info.project.name}`);
  const res = await page.request.post("/api/batches", {
    data: {
      houseId,
      placedOn: lagos(-7),
      breed: "Ross 308",
      delivered: 100,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
      confirm: true,
    },
  });
  expect([200, 201]).toContain(res.status());
  const batch = await res.json();

  await page.goto(`/batches/${batch.id}`);
  const main = page.getByRole("main");
  await expect(main.getByText("Newcastle (Lasota or B1)")).toBeVisible();
  await expect(main.getByText(/is due \(day 7\)/)).toBeVisible();
  await main.getByRole("link", { name: "Record it" }).click();
  await expect(page).toHaveURL(new RegExp(`tab=health`));

  await main.getByRole("button", { name: "Record Newcastle (Lasota or B1)" }).click();
  const sheet = page.getByRole("dialog", { name: "Record health" });
  await expect(sheet.getByLabel("Programme dose")).toHaveValue("nd-1");
  // With a Newcastle vaccine in stock (other tests add one) it's taken from there; here it's bought.
  const bought = sheet.getByRole("radio", { name: "Bought for this" });
  if (await bought.isVisible()) {
    await bought.click();
    await sheet.getByLabel("Vaccine").fill("Newcastle (Lasota or B1)");
  }
  await expect(sheet.getByLabel("Vaccine")).toHaveValue("Newcastle (Lasota or B1)");
  await sheet.getByLabel("Done by").fill("Tunde");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Newcastle (Lasota or B1) recorded.")).toBeVisible();

  const dose = main.getByRole("listitem").filter({ hasText: "Newcastle (Lasota or B1)" }).first();
  await expect(dose.getByText("Given", { exact: true })).toBeVisible();
  await expect(main.getByText("by Tunde")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a drug's withdrawal warns against selling until it's over", async ({ page }, info) => {
  const errors = watchErrors(page);
  const houseId = await house(page, `Drugs ${info.project.name}`);
  const batch = await (
    await page.request.post("/api/batches", {
      data: {
        houseId,
        placedOn: lagos(-30),
        breed: "Ross 308",
        delivered: 50,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  await page.goto(`/batches/${batch.id}?tab=health`);
  await page.getByRole("main").getByRole("button", { name: "Add" }).click();
  const sheet = page.getByRole("dialog", { name: "Record health" });
  await sheet.getByRole("radio", { name: "Medication" }).click();
  await sheet.getByLabel("Drug").fill("Enrofloxacin");
  await sheet.getByLabel("Method").selectOption("Drinking water");
  await sheet.getByLabel("Withdrawal (days)").fill("5");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Enrofloxacin recorded.")).toBeVisible();

  await page.goto(`/batches/${batch.id}`);
  await expect(page.getByText(/no birds sold for meat until after/)).toBeVisible();
  expect(errors).toEqual([]);
});
