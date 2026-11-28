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
  await expect(page).toHaveURL(/by=batch/);
  const batches = main.getByRole("table", { name: "Profit and loss by batch" });
  await expect(batches.getByRole("link", { name: /^B-\d{4}-\d{2}/ }).first()).toBeVisible();

  // It downloads as a spreadsheet: naira as plain numbers Excel adds up, dates Excel reads.
  const csvFile = page.waitForEvent("download");
  await main.getByRole("link", { name: "Download CSV" }).click();
  const csv = await csvFile;
  expect(csv.suggestedFilename()).toBe("fowlex-profit-by-batch-cash.csv");
  const text = await (await import("node:fs/promises")).readFile((await csv.path())!, "utf8");
  const [head, firstRow] = text.replace(/^\uFEFF/, "").split("\r\n");
  expect(head).toBe(
    '"Batch","Placed","Income (NGN)","Direct costs (NGN)","Shared costs (NGN)","Net profit (NGN)","Margin (%)","Cost a bird (NGN)","Cost a kg (NGN)"',
  );
  expect(firstRow).toMatch(/^"B-\d{4}-\d{2}","\d{4}-\d{2}-\d{2}",-?\d+(\.\d+)?,/);

  // And as a PDF.
  const pdfFile = page.waitForEvent("download");
  await main.getByRole("link", { name: "Download PDF" }).click();
  expect((await pdfFile).suggestedFilename()).toBe("fowlex-profit-by-batch-cash.pdf");

  // Every other report: cash flow by month, with its totals.
  await main.getByRole("combobox", { name: "Report" }).selectOption("cashflow");
  await expect(page).toHaveURL(/report=cashflow/);
  const flow = main.getByRole("table", { name: /^Cash flow, \d{4}$/ });
  await expect(flow.locator("tfoot")).toContainText("Total");
  for (const report of ["expenses", "sales", "aging", "payroll"]) {
    await main.getByRole("combobox", { name: "Report" }).selectOption(report);
    await expect(page).toHaveURL(new RegExp(`report=${report}`));
    await expect(main.locator("table caption")).toBeAttached();
  }
  expect(errors).toEqual([]);
});
