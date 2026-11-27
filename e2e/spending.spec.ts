import { expect, type Page, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

/** A supplier and a feed item of this test's own, through the API. */
async function setup(page: Page, label: string, accountNumber = "0123456781") {
  const tag = `${label} ${Date.now().toString(36)}`;
  const supplier = await (
    await page.request.post("/api/suppliers", {
      data: { name: `Mill ${tag}`, supplies: ["feed"], bank: { bankCode: "058", accountNumber } },
    })
  ).json();
  const item = await (
    await page.request.post("/api/inventory/items", {
      data: { name: `Feed ${tag}`, category: "feed", unit: "bag", unitKg: 25, reorderLevel: 5 },
    })
  ).json();
  return { supplier, item };
}

test("buy 20 bags of feed and pay the supplier through Paystack: stock comes in, the expense is paid", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const { supplier, item } = await setup(page, info.project.name);
  await page.goto(`/inventory/${item.id}`);
  await page.getByRole("button", { name: "Buy more" }).click();

  const sheet = page.getByRole("dialog", { name: "Spend money" });
  await sheet.getByLabel("Bought from").selectOption({ label: `${supplier.name} · can pay` });
  await expect(sheet.getByLabel("Item")).toHaveValue(item.id);
  await sheet.getByLabel("How many bags").fill("20");
  await sheet.getByLabel("Price per bag").fill("18000");
  await expect(sheet.getByText("₦360,000.00").first()).toBeVisible();
  await sheet.getByRole("radio", { name: /Pay now with Paystack/ }).click();
  await expect(sheet.getByText(/To CHIOMA EZE, Guaranty Trust Bank ••••6781/)).toBeVisible();
  await sheet.getByRole("button", { name: "Next: pay ₦360,000.00" }).click();

  const pay = page.getByRole("dialog", { name: `20 bags ${item.name}` });
  await expect(pay.getByText("CHIOMA EZE", { exact: true }).first()).toBeVisible();
  const send = pay.getByRole("button", { name: "Send ₦360,000.00" });
  await expect(send).toBeDisabled();
  await pay.getByRole("checkbox").check();
  await send.click();
  await expect(page.getByText("₦360,000.00 sent to CHIOMA EZE.")).toBeVisible();
  await expect(pay.getByText("Paid", { exact: true })).toBeVisible();
  await expect(pay.getByText(/Sent to CHIOMA EZE/)).toBeVisible();
  await pay.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await expect(page.getByRole("main").getByText("20 bags").first()).toBeVisible();
  await page.goto("/expenses");
  await expect(page.getByRole("main").getByText(`20 bags ${item.name}`)).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText(/Paystack fee for paying EXP-/)
      .first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("pay someone who isn't a saved supplier: enter their account, the bank names it, send", async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Spend money" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Spend money" });
  await sheet.getByRole("radio", { name: "Other expense" }).click();
  await sheet.getByRole("radio", { name: "Transport" }).click();
  await sheet.getByLabel("Amount").fill("10000");
  await sheet.getByLabel("For", { exact: true }).fill(`Lorry hire ${info.project.name} ${Date.now().toString(36)}`);
  await sheet.getByLabel("Who was paid").fill("Musa");
  await sheet.getByRole("radio", { name: /Pay now with Paystack/ }).click();
  await expect(sheet.getByText("To any bank account: enter it below.")).toBeVisible();
  await sheet.getByRole("button", { name: /Next: pay/ }).click();
  await expect(sheet.getByText("Enter the bank account to pay.")).toBeVisible();

  await sheet.getByLabel("Bank").selectOption({ label: "Guaranty Trust Bank" });
  await sheet.getByLabel("Account number").fill("0123456783");
  await expect(sheet.getByText(/To NGOZI OKAFOR, Guaranty Trust Bank ••••6783/)).toBeVisible();
  await expect(sheet.getByRole("checkbox", { name: /Save as a supplier/ })).not.toBeChecked();
  await sheet.getByRole("button", { name: "Next: pay ₦10,000.00" }).click();

  const pay = page.getByRole("dialog", { name: /^Lorry hire/ });
  await expect(pay.getByText("NGOZI OKAFOR", { exact: true }).first()).toBeVisible();
  await pay.getByRole("checkbox").check();
  await pay.getByRole("button", { name: "Send ₦10,000.00" }).click();
  await expect(page.getByText("₦10,000.00 sent to NGOZI OKAFOR.")).toBeVisible();
  await expect(pay.getByText("Paid", { exact: true })).toBeVisible();
  await expect(pay.getByText("Musa")).toBeVisible();
  expect(errors).toEqual([]);
});

test("buy something not yet in stock: the item is made with the purchase", async ({ page }, info) => {
  const errors = watchErrors(page);
  const name = `Layer mash ${info.project.name} ${Date.now().toString(36)}`;
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Buy stock" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Spend money" });
  await sheet.getByLabel("Item").selectOption("__new");
  await sheet.getByLabel("New item's name").fill(name);
  await expect(sheet.getByLabel("Kind", { exact: true }).last()).toHaveValue("feed");
  await expect(sheet.getByLabel("Kg per bag")).toHaveValue("25");
  await sheet.getByLabel("How many bags").fill("10");
  await sheet.getByLabel("Price per bag").fill("17000");
  await sheet.getByRole("radio", { name: /Already paid/ }).click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/EXP-\d{4}-\d{4} recorded\./)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("main").getByRole("link", { name: new RegExp(name) })).toContainText("10 bags");
  expect(errors).toEqual([]);
});

test("a supplier's page shows what's owed after two unpaid purchases", async ({ page }, info) => {
  const { supplier, item } = await setup(page, `owed ${info.project.name}`);
  for (const quantity of [2, 3])
    await page.request.post("/api/expenses", {
      data: {
        supplierId: supplier.id,
        lines: [{ itemId: item.id, quantity, unitCostKobo: 1_000_000 }],
        method: "later",
      },
    });
  await page.goto("/suppliers");
  await expect(page.getByRole("link", { name: new RegExp(supplier.name) })).toContainText("You owe ₦50,000.00");
  await page.getByRole("link", { name: new RegExp(supplier.name) }).click();
  await expect(page.getByRole("main").getByText("₦50,000.00").first()).toBeVisible();
  await expect(page.getByText("2 not paid yet")).toBeVisible();
});

test("a transfer the bank refuses leaves it owed, to pay again", async ({ page }, info) => {
  const errors = watchErrors(page);
  const { supplier } = await setup(page, `failing ${info.project.name}`, "0123450002");
  const expense = await (
    await page.request.post("/api/expenses", {
      data: {
        category: "transport",
        amountKobo: 1_000_000,
        description: `Haulage ${info.project.name}`,
        supplierId: supplier.id,
        method: "later",
      },
    })
  ).json();
  await page.goto("/expenses");
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(`Haulage ${info.project.name}`) })
    .click();
  const sheet = page.getByRole("dialog", { name: `Haulage ${info.project.name}` });
  await sheet.getByRole("button", { name: "Pay ₦10,000.00 with Paystack" }).click();
  await sheet.getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Send ₦10,000.00" }).click();
  await expect(sheet.getByText("Transfer failed", { exact: true })).toBeVisible();
  await expect(
    sheet.getByText(/The bank didn't accept the transfer. Nothing was sent. You can pay again./),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Pay ₦10,000.00 with Paystack" })).toBeVisible();
  expect(expense.paymentStatus).toBe("unpaid");
  expect(errors).toEqual([]);
});

test.describe("managers", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("record transport paid in cash with no receipt, and can't send money", async ({ page }, info) => {
    const errors = watchErrors(page);
    await signInAs(page, E2E_USERS.manager.email);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Spend money" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Spend money" });
    await sheet.getByRole("radio", { name: "Other expense" }).click();
    await sheet.getByRole("radio", { name: "Transport" }).click();
    await sheet.getByLabel("Amount").fill("15000");
    await sheet.getByLabel("For", { exact: true }).fill(`Feed from Ibadan ${info.project.name}`);
    await sheet.getByLabel("Who was paid").fill("Okada rider");
    await expect(sheet.getByRole("radio", { name: /Pay now with Paystack/ })).toHaveAttribute("aria-disabled", "true");
    await expect(sheet.getByText("Only the owners send money.")).toBeVisible();
    await sheet.getByRole("radio", { name: /Already paid/ }).click();
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/EXP-\d{4}-\d{4} recorded\./)).toBeVisible();

    const row = page
      .getByRole("main")
      .getByRole("button", { name: new RegExp(`Feed from Ibadan ${info.project.name}`) });
    await expect(row).toContainText("₦15,000.00");
    await expect(row).toContainText("Paid");
    await expect(row).toContainText("Okada rider");
    expect(errors).toEqual([]);
  });

  test("attach a receipt photo to an expense", async ({ page }, info) => {
    await signInAs(page, E2E_USERS.manager.email);
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Spend money" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Spend money" });
    await sheet.getByRole("radio", { name: "Other expense" }).click();
    await sheet.getByRole("radio", { name: "Repairs" }).click();
    await sheet.getByLabel("Amount").fill("8000");
    await sheet.getByLabel("For", { exact: true }).fill(`Drinker repair ${info.project.name}`);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    await sheet
      .locator('input[type="file"]')
      .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
    await sheet.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/EXP-\d{4}-\d{4} recorded\./)).toBeVisible();
    await page
      .getByRole("main")
      .getByRole("button", { name: new RegExp(`Drinker repair ${info.project.name}`) })
      .click();
    const receipt = page.getByRole("link", { name: "View receipt" });
    await expect(receipt).toBeVisible();
    const res = await page.request.get((await receipt.getAttribute("href"))!);
    expect(res.headers()["content-type"]).toMatch(/^image\//);
  });
});
