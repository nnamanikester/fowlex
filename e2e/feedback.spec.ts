import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

// The browser logs a refused request as a console error; these tests refuse requests on purpose.
const REFUSED = [/status of (503|409)/];

test("a Paystack outage while adding someone is said above the button, and saving again works", async ({
  page,
}, info) => {
  const errors = watchErrors(page, REFUSED);
  const name = `Ada ${info.project.name} ${Date.now().toString(36)}`;
  await page.goto("/people");
  await page.getByRole("main").getByRole("button", { name: "Add someone" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add someone" });
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByLabel("Pay a month").fill("50000");
  await sheet.getByLabel("Bank").selectOption({ label: "Guaranty Trust Bank" });
  await sheet.getByLabel("Account number").fill("0123456783");
  await expect(sheet.getByText("NGOZI OKAFOR")).toBeVisible();

  // The bank named it in the form, then Paystack fell over when the server checked it again.
  const message = "We couldn't check the bank account just now. Try saving again in a moment.";
  await page.route("**/api/employees", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          json: { error: { code: "paystack_unavailable", message, field: "bank" } },
        })
      : route.fallback(),
  );
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  // On the bank field, and above the button where it's in view however far down they are.
  await expect(sheet.getByRole("alert").filter({ hasText: message })).toHaveCount(2);
  await expect(sheet.getByRole("alert").filter({ hasText: message }).last()).toBeInViewport();
  await expect(sheet.getByRole("button", { name: "Add", exact: true })).toBeEnabled();

  await page.unroute("**/api/employees");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`${name} added.`)).toBeVisible();
  expect(errors).toEqual([]);
});

test("a bank that can't be reached says what to do instead of 'finish the account'", async ({ page }) => {
  const errors = watchErrors(page, REFUSED);
  await page.goto("/people");
  await page.getByRole("main").getByRole("button", { name: "Add someone" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add someone" });
  await sheet.getByLabel("Name").fill("Bank down");
  await sheet.getByLabel("Pay a month").fill("50000");
  await sheet.getByLabel("Bank").selectOption({ label: "Guaranty Trust Bank" });
  await sheet.getByLabel("Account number").fill("1111111111");
  await expect(sheet.getByRole("button", { name: "Retry" })).toBeVisible();
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(sheet.getByText(/The bank couldn't be reached to check this account/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("a delete that's refused keeps the dialog open and says why", async ({ page }, info) => {
  const errors = watchErrors(page, REFUSED);
  const name = `Refused ${info.project.name} ${Date.now().toString(36)}`;
  const supplier = await (await page.request.post("/api/suppliers", { data: { name, supplies: ["feed"] } })).json();
  await page.goto(`/suppliers/${supplier.id}`);
  await page.route(`**/api/suppliers/${supplier.id}`, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 409,
          json: { error: { code: "in_use", message: "They're on expenses, so they can't be deleted." } },
        })
      : route.fallback(),
  );
  await page.getByRole("main").getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog", { name }).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${name}?` });
  await confirm.getByRole("button", { name: "Delete supplier" }).click();
  await expect(confirm.getByRole("alert")).toContainText("They're on expenses, so they can't be deleted.");
  await expect(confirm.getByRole("button", { name: "Delete supplier" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a button that can't be pressed yet says why when tapped", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Invite someone" }).first().click();
  const send = page.getByRole("dialog", { name: "Invite someone" }).getByRole("button", { name: /Send/ });
  await expect(send).toBeDisabled();
  await send.click({ force: true });
  await expect(page.getByRole("tooltip", { name: "Type their email first." })).toBeVisible();
  await expect(send).toHaveAccessibleDescription("Type their email first.");
  expect(errors).toEqual([]);
});

test("going offline says so until the connection is back", async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await context.setOffline(true);
  await expect(page.getByText("You're offline")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Back online")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a link to something that isn't there says so inside the app", async ({ page }) => {
  await page.goto("/people/000000000000000000000000");
  await expect(page.getByRole("heading", { name: "We couldn't find that" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go home" })).toBeVisible();
});
