import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

const naira = (text: string) => {
  const m = text.match(/(-?)₦([\d,]+(?:\.\d\d)?)/);
  return m ? Math.round(Number(m[2].replace(/,/g, "")) * 100) * (m[1] ? -1 : 1) : 0;
};

/** A card's exact amount: from its title when the card shows it rounded. */
const exact = (main: import("@playwright/test").Locator, label: string) =>
  main
    .getByText(label)
    .first()
    .locator("xpath=ancestor::*[contains(., '₦')][1]")
    .evaluate((el) => el.querySelector("[title]")?.getAttribute("title") ?? el.textContent ?? "");

test("the Overview shows the same numbers as the reports, the farm's batches and its charts", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();

  // This month's income is this month's row on Reports; this year's is the year's card there.
  const thisMonth = naira(await exact(main, "Income this month"));
  const card = await main
    .getByText("Income this month")
    .first()
    .locator("xpath=ancestor::*[contains(., '₦')][1]")
    .innerText();
  const thisYear = naira(card.match(/-?₦[\d,]+\.\d\d this year/)![0]);
  await expect(main.getByRole("img", { name: "Income and costs by month" })).toBeVisible();
  await expect(main.getByRole("img", { name: /Income by month, and the next two/ })).toBeVisible();
  // The forecast says how its range was worked out.
  await expect(main.getByText("Lowest to highest of the last three")).toBeVisible();
  await expect(main.getByRole("link", { name: /^B-\d{4}-\d{2}/ }).first()).toBeVisible();

  await page.goto("/reports");
  const rows = main.getByRole("table", { name: /Profit and loss by month/ }).locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  const last = await rows.last().locator("td").nth(1).innerText();
  expect(naira(last)).toBe(thisMonth);
  expect(naira(await exact(main, "Income"))).toBe(thisYear);
  expect(errors).toEqual([]);
});
