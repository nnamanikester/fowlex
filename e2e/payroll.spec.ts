import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("a month's pay: worked out from salary, attendance and an advance, adjusted, approved and paid", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  // Its own month in the past, so runs in parallel never meet.
  const year = 2000 + (Date.now() % 20);
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const period = `${year}-${month}`;
  const add = async (data: Record<string, unknown>) =>
    (await page.request.post("/api/employees", { data: { startDate: `${year - 1}-01-01`, ...data } })).json();
  const bola = await add({
    name: `Bola ${tag}`,
    payType: "monthly",
    rateKobo: 6_000_000,
    bank: { bankCode: "058", accountNumber: "0123456781" },
  });
  const musa = await add({ name: `Musa ${tag}`, payType: "daily", rateKobo: 400_000 });
  for (const day of ["02", "03", "04"])
    await page.request.post("/api/attendance", {
      data: { date: `${period}-${day}`, entries: [{ employeeId: musa.id, status: "present" }] },
    });
  await page.request.post("/api/advances", {
    data: { employeeId: bola.id, amountKobo: 1_000_000, date: `${period}-05`, firstPeriod: period },
  });
  const run = await (await page.request.post("/api/payroll", { data: { period } })).json();

  await page.goto(`/payroll/${run.id}`);
  const main = page.getByRole("main");
  const bolaRow = main.getByRole("listitem").filter({ hasText: `Bola ${tag}` });
  const musaRow = main.getByRole("listitem").filter({ hasText: `Musa ${tag}` });
  await expect(bolaRow).toContainText("Monthly salary");
  await expect(bolaRow).toContainText("− ₦10,000.00 advance");
  await expect(bolaRow).toContainText("₦50,000.00");
  await expect(musaRow).toContainText("3 days × ₦4,000.00");
  await expect(musaRow).toContainText("No bank account: pay in cash");

  await musaRow.getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: `Musa ${tag}` });
  await sheet.getByLabel("Bonus").fill("2000");
  await sheet.getByLabel("Deduction").fill("500");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText("Say what it's for, so it shows on the payslip.")).toBeVisible();
  await sheet.getByLabel("What for").fill("Broken bucket");
  await expect(sheet.getByText("₦13,500.00")).toBeVisible();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Musa ${tag}'s pay saved.`)).toBeVisible();
  await expect(musaRow).toContainText("+ ₦2,000.00 bonus · − ₦500.00 Broken bucket");

  await page.getByRole("button", { name: /^Approve ₦/ }).click();
  await expect(page.getByText(/pay approved: ₦[\d,.]+ to pay\.$/)).toBeVisible();
  await expect(main.getByText("To pay", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /^Pay everyone through Paystack/ }).click();
  await expect(page.getByText(/payments? sent\./)).toBeVisible();
  await expect(bolaRow).toContainText("Paid");

  // Musa is paid in cash, from the payslip.
  await musaRow.getByRole("button").click();
  await page.getByRole("button", { name: "Paid outside Fowlex" }).click();
  await page.getByRole("dialog", { name: "Paid outside Fowlex" }).getByRole("button", { name: "Mark as paid" }).click();
  await page.keyboard.press("Escape");
  await expect(musaRow).toContainText("Paid");
  await expect(musaRow).toContainText("₦13,500.00");

  await page.goto("/payroll");
  await expect(
    main
      .getByRole("link")
      .filter({ hasText: new RegExp(`${year}`) })
      .first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
