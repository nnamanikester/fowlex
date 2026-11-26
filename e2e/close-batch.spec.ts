import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

const lagos = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(Date.now() + offset * 86_400_000));

test("a batch with 5 birds unaccounted for can't close; once they're logged it closes and locks", async ({
  page,
}, info) => {
  const errors = watchErrors(page, [/status of 409/]);
  const house = await (
    await page.request.post("/api/houses", {
      data: { name: `Close ${info.project.name} ${Date.now().toString(36)}`, capacity: 500 },
    })
  ).json();
  const batch = await (
    await page.request.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: lagos(-40),
        breed: "Ross 308",
        delivered: 100,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  const log = (data: Record<string, unknown>) =>
    page.request.post("/api/logs", { data: { batchId: batch.id, ...data } });
  expect((await log({ date: lagos(-10), deaths: 3, culls: 2, sold: 90 })).status()).toBe(201);

  await page.goto(`/batches/${batch.id}`);
  await page.getByRole("button", { name: `${batch.code} actions` }).click();
  await page.getByRole("menuitem", { name: "Close batch" }).click();
  const sheet = page.getByRole("dialog", { name: `Close ${batch.code}` });
  await expect(sheet.getByText("5 birds aren't accounted for.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Close batch" })).toBeDisabled();
  await expect(sheet.getByRole("link", { name: "Log the missing birds" })).toHaveAttribute(
    "href",
    `/log?batch=${batch.id}`,
  );
  // The server refuses too, with the same count.
  const refused = await page.request.post(`/api/batches/${batch.id}/close`, { data: { version: batch.version } });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error.details.tally.unaccounted).toBe(5);
  await sheet.getByRole("button", { name: "Close", exact: true }).click();

  expect((await log({ date: lagos(-1), sold: 5 })).status()).toBe(201);
  await page.reload();
  await expect(page.getByText("Every bird is accounted for. Close the batch to lock its records.")).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Close batch" }).click();
  await expect(sheet.getByText("Every bird is accounted for.")).toBeVisible();
  await sheet.getByRole("button", { name: "Close batch" }).click();
  await expect(page.getByText(`${batch.code} is closed.`)).toBeVisible();
  await expect(page.getByText(/Closed on .*Its daily logs and health record are locked\./)).toBeVisible();

  // Its logs are locked.
  const locked = await log({ date: lagos(0), deaths: 1 });
  expect(locked.status()).toBe(409);
  expect((await locked.json()).error.code).toBe("closed");
  expect(errors).toEqual([]);
});
