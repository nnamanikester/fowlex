import { expect, test } from "@playwright/test";

import { ready, watchErrors } from "./helpers";
import { E2E_BATCHES } from "./users";

const lagos = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(Date.now() + offset * 86_400_000));

test("opening stock, feed logged from it comes off, and a count sets it right", async ({ page }, info) => {
  const errors = watchErrors(page);
  const name = `Starter feed stock ${info.project.name}`;
  const item = await (
    await page.request.post("/api/inventory/items", {
      data: { name, category: "feed", unit: "bag", unitKg: 25, reorderLevel: 10 },
    })
  ).json();

  await page.goto(`/inventory/${item.id}`);
  await page.getByRole("button", { name: "Opening stock" }).click();
  const opening = page.getByRole("dialog", { name: "Opening stock" });
  await opening.getByLabel("On hand (bags)").fill("20");
  await opening.getByLabel("Cost per bag").fill("18000");
  await opening.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`20 bags of ${name} added.`)).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText("₦360,000.00").first()).toBeVisible();

  // The daily log takes 125 kg (5 bags) of it, a day each browser has to itself.
  await page.goto("/batches");
  const batchHref = (await page.getByRole("link", { name: new RegExp(E2E_BATCHES[0].code) }).getAttribute("href"))!;
  await page.goto(`/log?batch=${batchHref.split("/").pop()}`);
  // Filled once the form is live (filled before, the date would reset to today).
  await ready(page.getByLabel("Date"));
  await page.getByLabel("Date").fill(lagos(info.project.name === "mobile" ? -6 : -5));
  await expect(page.getByRole("button", { name: /^Save log for \d/ })).toBeVisible();
  await page.getByLabel("Feed", { exact: true }).selectOption({ label: name });
  await expect(page.getByText("20 bags left")).toBeVisible();
  await page.getByLabel("Feed used (kg)").fill("125");
  await page.getByRole("button", { name: /^Save log for/ }).click();
  await expect(page.getByText(new RegExp(`Logged ${E2E_BATCHES[0].code}`))).toBeVisible();

  await page.goto(`/inventory/${item.id}`);
  await expect(main.getByText("15 bags").first()).toBeVisible();
  await expect(main.getByText("from the daily log")).toBeVisible();
  await expect(main.getByText(E2E_BATCHES[0].code)).toBeVisible();

  await page.getByRole("button", { name: "Count stock" }).click();
  const count = page.getByRole("dialog", { name: "Count stock" });
  await count.getByLabel("Counted (bags)").fill("9");
  await expect(count.getByText("Missing 6 bags, recorded as a stock count.")).toBeVisible();
  await count.getByRole("button", { name: "Save count" }).click();
  await expect(page.getByText("Stock set to 9 bags.")).toBeVisible();

  await page.goto("/inventory");
  const row = main.getByRole("link", { name: new RegExp(name) });
  await expect(row).toContainText("9 bags");
  await expect(row).toContainText("Low");
  expect(errors).toEqual([]);
});
