import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

const lagos = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(Date.now() + offset * 86_400_000));

test("the batch page works out FCR, EPEF and growth against the standard from the logs", async ({ page }, info) => {
  const errors = watchErrors(page);
  const house = await (
    await page.request.post("/api/houses", {
      data: { name: `KPIs ${info.project.name} ${Date.now().toString(36)}`, capacity: 2000 },
    })
  ).json();
  const batch = await (
    await page.request.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: lagos(-35),
        breed: "Ross 308",
        delivered: 1000,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  // The textbook flock: a log every day, 40 lost, 3,840 kg of feed, 2.5 kg at day 35.
  for (let day = 1; day <= 35; day++) {
    const data = {
      batchId: batch.id,
      date: lagos(day - 35),
      feedKg: day === 35 ? 100 : 110,
      ...(day === 9 && { deaths: 30, culls: 10 }),
      ...(day === 35 && { avgWeightGrams: 2500 }),
    };
    expect((await page.request.post("/api/logs", { data })).status()).toBe(201);
  }
  await page.goto(`/batches/${batch.id}`);
  const kpi = (label: string) =>
    page
      .getByRole("main")
      .locator("dl > div")
      .filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) })
      .locator("dd")
      .first();
  await expect(kpi("Livability")).toHaveText("96%");
  await expect(kpi("FCR")).toHaveText("1.6");
  await expect(kpi("Daily gain")).toHaveText("70.2 g");
  await expect(kpi("EPEF")).toHaveText("429");
  await expect(kpi("Feed per bird")).toHaveText("4 kg");
  await expect(page.getByText(/4\.2% below the Ross 308 standard/)).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Average weight \(kg\) of this Ross 308 batch against the Ross 308 standard/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
