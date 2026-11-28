import { expect, test, type Page } from "@playwright/test";

import { watchErrors } from "./helpers";

const lagos = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(Date.now() + offset * 86_400_000));

/** A batch, a customer with an email, and `count` delivered orders of 10 birds at ₦8,500. */
async function delivered(page: Page, label: string, count = 1) {
  const tag = `${label} ${Date.now().toString(36)}`;
  const house = await (await page.request.post("/api/houses", { data: { name: `Inv ${tag}`, capacity: 5000 } })).json();
  const batch = await (
    await page.request.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: lagos(-38),
        breed: "Ross 308",
        delivered: 500,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  const email = `grill-${Date.now().toString(36)}-${label.replace(/\W/g, "")}@farm.test`;
  const customer = await (
    await page.request.post("/api/customers", { data: { name: `Grill ${tag}`, type: "lounge", email, termsDays: 14 } })
  ).json();
  const orders = [];
  for (let n = 0; n < count; n++) {
    const o = await (
      await page.request.post("/api/sales", {
        data: {
          customerId: customer.id,
          deliveryDate: lagos(),
          lines: [{ batchId: batch.id, birds: 10, weightGrams: 0, priceKobo: 850_000, pricing: "perBird" }],
          deliveryKobo: 0,
        },
      })
    ).json();
    orders.push(await (await page.request.post(`/api/sales/${o.id}/deliver`, { data: { version: o.version } })).json());
  }
  return { customer, orders, email };
}

test("an order comes with its invoice: open it from the order, send it as a PDF, and download it", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const { customer, orders, email } = await delivered(page, info.project.name);
  await page.goto(`/customers/${customer.id}`);
  const main = page.getByRole("main");
  await main.getByRole("listitem").filter({ hasText: orders[0].number }).getByRole("button").click();
  // Booking the order made its invoice: a draft, nothing to do but send it.
  await page
    .getByRole("dialog", { name: new RegExp(orders[0].number) })
    .getByRole("link", { name: "See its invoice" })
    .click();

  const invoice = page.getByRole("dialog", { name: new RegExp(`INV-\\d{4}-\\d{4} · ${customer.name}`) });
  await expect(invoice).toContainText("Draft");
  await expect(invoice).toContainText("₦85,000.00");
  await invoice.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText(new RegExp(`^INV-\\d{4}-\\d{4} sent to ${email.replace(/[.+]/g, "\\$&")}\\.$`)),
  ).toBeVisible();
  const mails = (await (await page.request.get("/api/dev/outbox")).json()) as { to: string; subject: string }[];
  expect(mails.find((m) => m.to === email)?.subject).toMatch(/^Invoice INV-\d{4}-\d{4} from .*: ₦85,000\.00$/);

  await page.goto(`/customers/${customer.id}`);
  const row = main.getByRole("listitem").filter({ hasText: /^INV-/ });
  await expect(row).toContainText("Sent");
  await row.getByRole("button").click();
  const sent = page.getByRole("dialog", { name: new RegExp(`INV-\\d{4}-\\d{4} · ${customer.name}`) });
  await expect(sent).toContainText(`To ${email}`);
  const download = page.waitForEvent("download");
  await sent.getByRole("link", { name: "PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Invoice INV-\d{4}-\d{4}\.pdf$/);
  expect(errors).toEqual([]);
});

test("a draft invoice is checked, then voided: its orders can be billed again", async ({ page }, info) => {
  // Voiding without a reason is refused on purpose.
  const errors = watchErrors(page, [/status of 400/]);
  const { customer } = await delivered(page, `void ${info.project.name}`, 2);
  await page.goto("/invoices");
  await page.getByRole("main").getByRole("button", { name: "New invoice" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New invoice" });
  await sheet.getByLabel("Customer").selectOption({ label: customer.name });
  await expect(sheet.getByRole("checkbox")).toHaveCount(2);
  await sheet.getByLabel("Discount").fill("5000");
  await expect(sheet).toContainText("₦165,000.00");
  await sheet.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText(/saved as a draft to check\.$/)).toBeVisible();

  const invoices = page.getByRole("main").locator("section", { has: page.getByRole("heading", { name: "Invoices" }) });
  const row = invoices.getByRole("listitem").filter({ hasText: customer.name });
  // The two orders' own drafts became this one invoice once the list refreshes.
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Draft");
  await row.getByRole("button").click();
  const invoice = page.getByRole("dialog", { name: new RegExp(customer.name) });
  await invoice.getByRole("button", { name: "Void it" }).click();
  const confirm = page.getByRole("dialog", { name: /^Void INV-/ });
  await confirm.getByRole("button", { name: "Void invoice" }).click();
  await expect(confirm.getByRole("alert")).toContainText("Say why it's void");
  await confirm.getByLabel("Why it's void").fill("Wrong discount");
  await confirm.getByRole("button", { name: "Void invoice" }).click();
  await expect(page.getByText(/^INV-\d{4}-\d{4} is void\.$/)).toBeVisible();
  await page.getByRole("radio", { name: "All" }).click();
  await expect(row).toContainText("Void");

  await page.getByRole("main").getByRole("button", { name: "New invoice" }).first().click();
  await page.getByRole("dialog", { name: "New invoice" }).getByLabel("Customer").selectOption({ label: customer.name });
  await expect(page.getByRole("dialog", { name: "New invoice" }).getByRole("checkbox")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("₦300,000 paid on a ₦500,000 invoice leaves it part paid with ₦200,000 left; the rest pays it", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const { customer, orders } = await delivered(page, `pay ${info.project.name}`, 1);
  // 10 birds at ₦8,500 plus a ₦415,000 charge on a second order: ₦500,000 in all.
  const extra = await (
    await page.request.post("/api/sales", {
      data: {
        customerId: customer.id,
        deliveryDate: lagos(),
        lines: [{ batchId: orders[0].lines[0].batchId, birds: 1, weightGrams: 0, priceKobo: 1, pricing: "perBird" }],
        deliveryKobo: 41_499_999,
      },
    })
  ).json();
  await page.request.post(`/api/sales/${extra.id}/deliver`, { data: { version: extra.version } });
  const invoice = await (
    await page.request.post("/api/invoices", { data: { orderIds: [orders[0].id, extra.id] } })
  ).json();
  expect(invoice.totalKobo).toBe(50_000_000);

  await page.goto("/invoices");
  const main = page.getByRole("main");
  const row = main.getByRole("listitem").filter({ hasText: invoice.number });
  await row.getByRole("button").click();
  const sheet = page.getByRole("dialog", { name: new RegExp(invoice.number) });
  await sheet.getByRole("button", { name: "Record a payment" }).click();
  const pay = page.getByRole("dialog", { name: "Record a payment" });
  await expect(pay.getByLabel("Amount paid")).toHaveValue("500,000.00");
  await pay.getByLabel("Amount paid").fill("300000");
  await expect(pay.getByText("₦200,000.00 will be left to pay")).toBeVisible();
  await pay.getByLabel("Reference").fill("GTB-77821");
  await pay.getByRole("button", { name: "Record ₦300,000.00" }).click();
  await expect(page.getByText(`₦300,000.00 recorded: ₦200,000.00 left on ${invoice.number}.`)).toBeVisible();
  await expect(row).toContainText("Part paid");
  await expect(row).toContainText("₦200,000.00");

  await row.getByRole("button").click();
  await expect(sheet.getByRole("listitem").filter({ hasText: "GTB-77821" })).toContainText("Bank transfer");
  await expect(sheet.getByRole("button", { name: "Void it" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Record a payment" }).click();
  await pay.getByRole("radio", { name: "Cash" }).click();
  await pay.getByRole("button", { name: "Record ₦200,000.00" }).click();
  await expect(page.getByText(`₦200,000.00 recorded: ${invoice.number} is paid in full.`)).toBeVisible();
  await page.getByRole("radio", { name: "Paid", exact: true }).click();
  await expect(row).toContainText("Paid");
  expect(errors).toEqual([]);
});

test("a customer's statement ends on what's left on their invoices, and the aging shows who owes what", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const { customer, orders, email } = await delivered(page, `statement ${info.project.name}`, 2);
  const [a, b] = await Promise.all(
    orders.map(async (o) => {
      const inv = await (await page.request.post("/api/invoices", { data: { orderIds: [o.id] } })).json();
      // Sent, as a statement shows what the customer has been sent.
      return (await page.request.post(`/api/invoices/${inv.id}/send`)).json();
    }),
  );
  await page.request.post(`/api/invoices/${a.id}/payments`, { data: { amountKobo: 3_000_000, method: "cash" } });
  // ₦85,000 + ₦85,000 billed, ₦30,000 paid: ₦140,000 owed.

  await page.goto(`/customers/${customer.id}`);
  const main = page.getByRole("main");
  const statement = main.locator("section", { has: page.getByRole("heading", { name: "Statement" }) });
  await expect(statement).toContainText("Owed at the end: ₦140,000.00");
  await expect(statement).toContainText(`Invoice ${a.number}`);
  await expect(statement).toContainText(`Payment for ${a.number}, Cash`);
  await expect(statement).toContainText(`Invoice ${b.number}`);
  const download = page.waitForEvent("download");
  await statement.getByRole("link", { name: "PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Statement Grill .* to .*\.pdf$/);
  await statement.getByRole("button", { name: "Email it" }).click();
  await expect(page.getByText(`Statement sent to ${email}.`)).toBeVisible();
  const mails = (await (await page.request.get("/api/dev/outbox")).json()) as { to: string; subject: string }[];
  expect(mails.find((m) => m.to === email && m.subject.startsWith("Your statement"))?.subject).toMatch(
    /₦140,000\.00 owed$/,
  );

  await page.goto("/invoices");
  const aging = main.locator("section", { has: page.getByRole("heading", { name: "Money owed, by how late" }) });
  await expect(aging.getByRole("link", { name: new RegExp(customer.name) })).toContainText("₦140,000.00");
  await expect(aging.getByRole("link", { name: new RegExp(customer.name) })).toContainText("2 invoices");
  expect(errors).toEqual([]);
});
