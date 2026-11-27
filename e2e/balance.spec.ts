import { expect, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

test("fund the Paystack balance with test money, see every movement with its audit trail, and match Paystack", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  // The top-up account the Paystack Dashboard shows, kept once (both projects share it).
  await page.request.patch("/api/balance/top-up", {
    data: { bankName: "Wema Bank", accountNumber: "9876543210", accountName: "Paystack-Fowlex Farms" },
  });

  // The book opens at Paystack's balance the first time anyone looks: everything after is its own line.
  await page.request.post("/api/balance/sync");
  // A transfer from Fowlex: booked the moment Paystack takes it, with who sent it and to whom.
  const supplier = await (
    await page.request.post("/api/suppliers", {
      data: { name: `Haulier ${tag}`, bank: { bankCode: "058", accountNumber: "0123456785" } },
    })
  ).json();
  const expense = await (
    await page.request.post("/api/expenses", {
      data: {
        category: "transport",
        amountKobo: 1_234_500,
        description: `Delivery run ${tag}`,
        supplierId: supplier.id,
        method: "later",
      },
    })
  ).json();
  expect((await page.request.post(`/api/expenses/${expense.id}/pay`)).ok()).toBe(true);

  await page.goto("/balance");
  const main = page.getByRole("main");
  await expect(main.getByText("In Paystack", { exact: true })).toBeVisible();
  // Opening the page checks with Paystack; parallel tests move the balance, so check until it settles.
  await expect(async () => {
    await page.getByRole("button", { name: "Check now" }).click();
    await expect(main.getByText("Matches Paystack")).toBeVisible({ timeout: 3000 });
  }).toPass();

  const transfer = main.getByRole("listitem").filter({ hasText: `To AMINA YUSUF: ${expense.number}` });
  await expect(transfer).toContainText("−₦12,345.00");
  await transfer.getByRole("button").click();
  const detail = page.getByRole("dialog", { name: `To AMINA YUSUF: ${expense.number}` });
  await expect(detail).toContainText("Confirmed by Paystack");
  await expect(detail).toContainText("From Fowlex");
  await expect(detail).toContainText(E2E_USERS.owner.name);
  await expect(detail).toContainText("Guaranty Trust Bank 0123456785");
  await expect(detail).toContainText(/fwx-exp-\d{4}-\d+-1/);
  await expect(detail.getByText("Balance history id")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    main.getByRole("listitem").filter({ hasText: `Paystack fee for paying AMINA YUSUF (${expense.number})` }),
  ).toContainText("−₦25.00");

  // Funding: the top-up account to copy, and test money that lands as funding.
  await page.getByRole("button", { name: "Fund balance" }).click();
  const fund = page.getByRole("dialog", { name: "Fund the balance" });
  await expect(fund).toContainText("9876543210");
  await expect(fund).toContainText("Paystack-Fowlex Farms");
  await expect(fund.getByRole("button", { name: "Copy the account number" })).toBeVisible();
  const pennies = 1_000 + Math.floor(Math.random() * 9_000);
  await fund.getByLabel("Amount").fill(String(pennies));
  await fund.getByRole("button", { name: /^Add ₦/ }).click();
  const naira = `₦${pennies.toLocaleString("en-NG")}.00`;
  await expect(page.getByText(`${naira} arrived in the balance.`)).toBeVisible();
  await expect(
    main
      .getByRole("listitem")
      .filter({ hasText: "Balance top-up" })
      .filter({ hasText: `+${naira}` }),
  ).toHaveCount(1);

  // The owners are told.
  const mails = (await (await page.request.get("/api/dev/outbox")).json()) as { to: string; subject: string }[];
  expect(mails.some((m) => m.to === E2E_USERS.owner.email && m.subject === `Paystack balance funded: ${naira}`)).toBe(
    true,
  );

  await page.getByRole("radio", { name: "Money in" }).click();
  await expect(main.getByRole("listitem").filter({ hasText: `To AMINA YUSUF: ${expense.number}` })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe("signed in as staff", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("staff can't open the Paystack balance", async ({ page }) => {
    await signInAs(page, E2E_USERS.staff.email);
    expect((await page.request.get("/api/balance")).status()).toBe(403);
  });
});
