import { expect, test } from "@playwright/test";

import { ready, watchErrors } from "./helpers";

const naira = (text: string) => {
  const m = text.match(/(-?)₦([\d,]+\.\d\d)/);
  return m ? Math.round(Number(m[2].replace(/,/g, "")) * 100) * (m[1] ? -1 : 1) : 0;
};

test("profit and loss by month adds up to the year, and by batch lists every batch", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/reports");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();

  // By month: this year's months so far, adding up to the year's income on the card.
  const months = main.getByRole("table", { name: /Profit and loss by month/ });
  await expect(months).toBeVisible();
  const rows = months.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  const incomes = await rows.evaluateAll((trs) => trs.map((tr) => tr.querySelectorAll("td")[1]?.textContent ?? ""));
  // The cards come before the table, so a label's first match is its card (a card's label can
  // carry a Profit or Loss badge, so it isn't matched exactly).
  const cardOf = (label: string) =>
    main
      .getByText(label)
      .first()
      .locator("xpath=ancestor::*[contains(., '₦')][1]")
      // A large amount is shown rounded, its exact figure in its title.
      .evaluate((el) => el.querySelector("[title]")?.getAttribute("title") ?? el.textContent ?? "");
  const card = await cardOf("Income");
  expect(incomes.reduce((n, t) => n + naira(t), 0)).toBe(naira(card));
  // Net profit is income less costs.
  expect(naira(await cardOf("Net profit"))).toBe(naira(card) - naira(await cardOf("Costs")));

  // As cash came in, then by batch: every batch, its code linking to it.
  const cash = main.getByRole("radio", { name: "Cash received" });
  await ready(cash);
  await cash.click();
  await expect(page).toHaveURL(/basis=cash/);
  await main.getByRole("radio", { name: "By batch" }).click();
  await expect(page).toHaveURL(/view=batches/);
  const batches = main.getByRole("table", { name: "Profit and loss by batch" });
  await expect(batches.getByRole("link", { name: /^B-\d{4}-\d{2}/ }).first()).toBeVisible();

  // The table exports as a spreadsheet.
  const download = page.waitForEvent("download");
  await main.getByRole("button", { name: /Export CSV/ }).click();
  expect((await download).suggestedFilename()).toBe("fowlex-profit-by-batch-cash.csv");
  expect(errors).toEqual([]);
});
