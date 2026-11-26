import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

const money = (text: string) => Number(text.replace(/[₦,]/g, ""));

test("the data table pages, sorts, searches, filters and exports CSV", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/design#tables");
  const table = page.getByRole("table", { name: "Invoices" });
  const rows = table.locator("tbody tr");

  await expect(page.getByText("1–10 of 26")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("11–20 of 26")).toBeVisible();

  // Sorting by total, smallest first, then largest first.
  await table.getByRole("button", { name: "Total" }).click();
  await expect(table.getByRole("columnheader", { name: "Total" })).toHaveAttribute("aria-sort", "ascending");
  const totals = (await rows.locator("td:last-child").allTextContents()).map(money);
  expect(totals).toEqual([...totals].sort((a, b) => a - b));
  await table.getByRole("button", { name: "Total" }).click();
  await expect(table.getByRole("columnheader", { name: "Total" })).toHaveAttribute("aria-sort", "descending");

  // Search, then a filter.
  await page.getByRole("searchbox", { name: "Search invoices" }).fill("grill");
  for (const text of await rows.allTextContents()) expect(text).toContain("The Grill Lounge");
  await page.getByRole("searchbox", { name: "Search invoices" }).fill("");
  await page.getByRole("button", { name: "Status: Any" }).click();
  await page.getByRole("menuitem", { name: "Overdue" }).click();
  await expect(rows.first()).toContainText("Overdue");
  const overdue = await rows.count();
  for (let i = 0; i < overdue; i++) await expect(rows.nth(i)).toContainText("Overdue");

  // CSV: Excel-ready, every filtered row, money as naira numbers.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("fowlex-invoices.csv");
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv.startsWith("﻿")).toBe(true);
  // Not trim(): it would strip the byte-order mark too.
  const lines = csv.replace(/\r\n$/, "").split("\r\n");
  expect(lines[0]).toBe('﻿"Invoice","Customer","Issued","Status","Total"');
  expect(lines).toHaveLength(overdue + 1);
  expect(lines[1]).toMatch(/^"INV-2026-\d{4}","[^"]+","2026-\d{2}-\d{2}","Overdue",\d+$/);

  expect(errors).toEqual([]);
});

test("money, dates and files", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/design#tables");

  // MoneyInput: naira in, whole kobo out; a third decimal is ignored.
  const amount = page.getByRole("textbox", { name: "Amount" });
  await amount.fill("");
  await amount.pressSequentially("12.345");
  await expect(amount).toHaveValue("12.34");
  await expect(page.getByText("Stored as 1234 kobo")).toBeVisible();
  await amount.blur();
  await expect(amount).toHaveValue("12.34");
  await amount.fill("");
  await amount.pressSequentially("18500");
  await amount.blur();
  await expect(amount).toHaveValue("18,500.00");

  // DateRangePicker: a preset, then a custom range.
  await page.getByRole("button", { name: /^Period: This month/ }).click();
  await page.getByRole("button", { name: /^Last month/ }).click();
  await expect(page.getByRole("button", { name: /^Period: Last month/ })).toBeVisible();
  await page.getByRole("button", { name: /^Period:/ }).click();
  const popover = page.getByRole("dialog", { name: "Period" });
  await popover.getByLabel("From", { exact: true }).fill("2026-11-03");
  await popover.getByLabel("To", { exact: true }).fill("2026-11-24");
  await popover.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("button", { name: "Period: 3–24 Nov 2026" })).toBeVisible();

  // FileDrop: a photo is attached and can be removed; a text file is refused.
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: Buffer.from("png") });
  const attached = page.getByRole("list", { name: "Attached files" });
  await expect(attached).toContainText("receipt.png");
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
  // Next.js has its own (empty) alert region, the route announcer: find ours by its text.
  await expect(page.getByRole("alert").filter({ hasText: "notes.txt" })).toHaveText("notes.txt isn't a photo or PDF.");
  await page.getByRole("button", { name: "Remove receipt.png" }).click();
  await expect(attached).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("charts draw, explain themselves on hover and read as tables", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/design#charts");

  const trend = page.getByRole("img", { name: "Revenue and expenses by month" });
  await expect(trend.locator(".recharts-line")).toHaveCount(2);
  const box = (await trend.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  const tip = trend.locator(".recharts-tooltip-wrapper");
  await expect(tip).toContainText("Revenue");
  await expect(tip).toContainText("Expenses");
  await expect(tip).toContainText("₦");

  // Every chart has a table view with every value.
  await page.getByText("View as table").first().click();
  await expect(page.getByRole("table", { name: "Revenue and expenses by month" }).locator("tbody tr")).toHaveCount(12);

  // The forecast marks today, and the breakdown folds its two smallest parts into Other.
  await expect(page.getByRole("img", { name: /Revenue, actual and forecast/ })).toContainText("Today");
  const breakdown = page.getByRole("figure", { name: "Expenses by category, November 2026" });
  await expect(breakdown.getByRole("listitem")).toHaveCount(6);
  await expect(breakdown).toContainText("Other");
  await expect(breakdown).not.toContainText("Miscellaneous");

  expect(errors).toEqual([]);
});
