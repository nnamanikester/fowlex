import { expect, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

const lagos = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

test("invite a customer to the portal: they set a password and see only their own invoices", async ({
  page,
  browser,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  const email = `portal-${Date.now().toString(36)}-${info.project.name}@buyer.test`;
  // A customer with a sent invoice of their own, and another customer's invoice beside it.
  const house = await (
    await page.request.post("/api/houses", { data: { name: `Portal ${tag}`, capacity: 5000 } })
  ).json();
  const batch = await (
    await page.request.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: new Date(Date.now() - 38 * 86_400_000).toISOString().slice(0, 10),
        breed: "Ross 308",
        delivered: 500,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  const invoiceFor = async (customerId: string, birds: number) => {
    const o = await (
      await page.request.post("/api/sales", {
        data: {
          customerId,
          deliveryDate: lagos(),
          lines: [{ batchId: batch.id, birds, weightGrams: 0, priceKobo: 850_000, pricing: "perBird" }],
          deliveryKobo: 0,
        },
      })
    ).json();
    await page.request.post(`/api/sales/${o.id}/deliver`, { data: { version: o.version } });
    const inv = await (await page.request.post("/api/invoices", { data: { orderIds: [o.id] } })).json();
    return (await page.request.post(`/api/invoices/${inv.id}/send`)).json();
  };
  const customer = await (
    await page.request.post("/api/customers", { data: { name: `Lounge ${tag}`, type: "lounge", email } })
  ).json();
  const other = await (
    await page.request.post("/api/customers", { data: { name: `Other ${tag}`, type: "hotel", email: `o-${email}` } })
  ).json();
  const mine = await invoiceFor(customer.id, 10);
  const theirs = await invoiceFor(other.id, 5);

  // The farm invites them from their page.
  await page.goto(`/customers/${customer.id}`);
  await page.getByRole("button", { name: "Invite to the portal" }).click();
  await expect(
    page.getByText(`Invite sent to ${email}: they set a password, then see their invoices in the portal.`),
  ).toBeVisible();
  await expect(page.getByRole("main").getByText("Invited to the portal")).toBeVisible();

  const mails = (await (await page.request.get("/api/dev/outbox")).json()) as { to: string; text: string }[];
  const link = mails.findLast((m) => m.to === email)!.text.match(/https?:\/\/\S+/)![0];

  // They accept in their own browser and land in the portal.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const them = await context.newPage();
  const theirErrors = watchErrors(them, [/status of 404/]);
  await them.goto(link);
  await them.getByLabel("Your name").fill("Chidi");
  await them.getByLabel("Password", { exact: true }).fill("lounge-password-2026");
  await them.getByRole("button", { name: "Join and sign in" }).click();
  await expect(them).toHaveURL("/portal");
  await expect(them.getByRole("heading", { name: "Welcome, Chidi" })).toBeVisible();
  await expect(them.getByRole("main")).toContainText("₦85,000.00");

  const row = them.getByRole("link", { name: new RegExp(mine.number) });
  await expect(row).toContainText("Sent");
  await expect(them.getByRole("link", { name: new RegExp(theirs.number) })).toHaveCount(0);
  await row.click();
  await expect(them.getByRole("heading", { name: new RegExp(mine.number) })).toBeVisible();
  // Pay now: an account for this invoice, paid (with the simulator's test money) and marked so by itself.
  await them.getByRole("button", { name: "Pay now by transfer" }).click();
  await expect(them.getByText("Transfer exactly")).toBeVisible();
  await them.getByRole("button", { name: "They've paid (test money)" }).click();
  await expect(them.getByText(/came in for INV-/)).toBeVisible({ timeout: 15_000 });
  const download = them.waitForEvent("download");
  await them.getByRole("link", { name: "PDF" }).click();
  expect((await download).suggestedFilename()).toBe(`Invoice ${mine.number}.pdf`);

  // Asking for another customer's invoice gets nothing.
  expect((await them.request.get(`/api/portal/invoices/${theirs.id}`)).status()).toBe(404);
  expect((await them.request.get(`/api/portal/invoices/${mine.id}`)).status()).toBe(200);
  expect((await them.request.get("/api/invoices")).status()).toBe(403);
  await them.goto(`/portal/invoices/${theirs.id}`);
  await expect(them.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();

  // Back on the farm's side, they now use the portal.
  await page.reload();
  await expect(page.getByRole("main").getByText("Uses the portal")).toBeVisible();
  await context.close();
  expect(errors).toEqual([]);
  expect(theirErrors).toEqual([]);
});

test.describe("the seeded customer", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("downloads a statement from the portal", async ({ page }) => {
    await signInAs(page, E2E_USERS.customer.email);
    await expect(page).toHaveURL("/portal");
    await expect(page.getByRole("heading", { name: `Welcome, ${E2E_USERS.customer.name}` })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download statement" }).click();
    expect((await download).suggestedFilename()).toMatch(/^Statement The Grill Lounge .*\.pdf$/);
    // Customers pay from their phones: nothing wider than the screen.
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(wide).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});
