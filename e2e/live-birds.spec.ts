import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";
import { E2E_BATCHES } from "./users";

test("the live count follows the logs: 1,200 placed, 12 dead, 3 culled, 185 sold leaves 1,000", async ({ page }) => {
  const errors = watchErrors(page);
  const batch = E2E_BATCHES[1];
  await page.goto("/batches");
  const href = (await page.getByRole("link", { name: new RegExp(batch.code) }).getAttribute("href"))!;
  const threeDaysAgo = new Date(`${batch.placedOn}T12:00:00Z`);
  threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() + batch.day - 3);

  // The same request id on every run, so both browsers share one log.
  const res = await page.request.post("/api/logs", {
    data: {
      batchId: href.split("/").pop(),
      date: threeDaysAgo.toISOString().slice(0, 10),
      deaths: 12,
      culls: 3,
      sold: 185,
      feedKg: 120,
      requestId: "e2e-live-birds-0001",
    },
  });
  expect([200, 201]).toContain(res.status());

  await page.goto(href);
  const main = page.getByRole("main");
  await expect(main.getByText("1,000", { exact: true })).toBeVisible();
  await expect(main.getByText("12 dead, 3 culled, 185 sold")).toBeVisible();
  await expect(main.getByText("1.3%", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
