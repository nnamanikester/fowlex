import { expect, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_BATCHES, E2E_USERS } from "./users";

test("place a batch of 1,000 birds, confirm sharing a house, and see it on the list at Day 0", async ({ page }) => {
  const errors = watchErrors(page, [/status of 409/]);
  await page.goto("/batches");
  await page.getByRole("button", { name: "New batch" }).filter({ visible: true }).first().click();

  const sheet = page.getByRole("dialog", { name: "New batch" });
  const house1 = await sheet
    .getByLabel("House")
    .locator("option", { hasText: /^House 1 —/ })
    .getAttribute("value");
  await sheet.getByLabel("House").selectOption(house1!);
  await expect(sheet.getByText("Day 0 · Week 1 today.")).toBeVisible();
  await sheet.getByLabel("Breed").fill("Cobb 500");
  await sheet.getByLabel("Chicks delivered").fill("1020");
  await sheet.getByLabel("Dead on arrival").fill("20");
  await sheet.getByLabel("Free extras").fill("20");
  await sheet.getByLabel("Price per chick").fill("850");
  await expect(sheet.getByText("1,000 placed · ₦850,000.00 for 1,000 paid chicks")).toBeVisible();
  await sheet.getByRole("button", { name: "Place batch" }).click();

  // House 1 already holds a batch: asked to confirm, then placed.
  const warning = sheet.getByRole("alert").filter({ hasText: "Check before going ahead" });
  // Lists every batch still in the house (other runs may have added one).
  await expect(warning).toContainText(E2E_BATCHES[0].code);
  await expect(warning).toContainText(/(is|are) still in House 1/);
  await warning.getByRole("button", { name: "Place anyway" }).click();

  const toast = page.getByText(/^B-\d{4}-\d{2} placed: 1,000 birds in House 1\.$/);
  await expect(toast).toBeVisible();
  const code = (await toast.textContent())!.split(" ")[0];

  const card = page.getByRole("link", { name: new RegExp(code) });
  await expect(card).toContainText("Growing");
  await expect(card).toContainText("Day 0");
  await expect(card).toContainText("Week 1");
  await expect(card).toContainText("1,000");
  await expect(card).toContainText("42 days to target");
  expect(errors).toEqual([]);
});

test("a batch's page: stats, tabs, selling, editing and deleting", async ({ page }) => {
  const errors = watchErrors(page, [/status of 400/]);
  // A batch of its own, placed through the API so this test stands alone.
  await page.goto("/batches");
  const created = await page.request.post("/api/batches", {
    data: {
      houseId: "",
      placedOn: E2E_BATCHES[1].placedOn,
      breed: "Ross 308",
      delivered: 500,
      pricePerChickKobo: 90_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
      confirm: true,
    },
  });
  // No house id: refused by field, nothing created.
  expect(created.status()).toBe(400);
  expect((await created.json()).error.field).toBe("houseId");

  // Use the seeded newer batch instead.
  const seeded = E2E_BATCHES[1];
  await page.getByRole("link", { name: new RegExp(seeded.code) }).click();
  await expect(page.getByRole("heading", { level: 1, name: seeded.code })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText(`Day ${seeded.day}`).first()).toBeVisible();
  await expect(main.getByText("1,200").first()).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Batch sections" });
  await tabs.getByRole("link", { name: "Daily logs" }).click();
  await expect(page).toHaveURL(/tab=logs/);
  // Real now: the seeded batch has no logs yet, or some from other tests.
  await expect(page.getByText(/No days logged yet|days? logged/).first()).toBeVisible();
  await tabs.getByRole("link", { name: "Overview" }).click();

  await page.getByRole("button", { name: `${seeded.code} actions` }).click();
  await page.getByRole("menuitem", { name: "Start selling" }).click();
  await expect(page.getByText(`${seeded.code} is now selling.`)).toBeVisible();
  await page.getByRole("button", { name: `${seeded.code} actions` }).click();
  await page.getByRole("menuitem", { name: "Back to growing" }).click();
  await expect(page.getByText(`${seeded.code} is back to growing.`)).toBeVisible();

  await page.getByRole("button", { name: `${seeded.code} actions` }).click();
  await page.getByRole("menuitem", { name: "Edit batch" }).click();
  const sheet = page.getByRole("dialog", { name: `Edit ${seeded.code}` });
  await sheet.getByLabel("Hatchery").fill("Zartech");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${seeded.code} saved.`)).toBeVisible();
  await expect(main.getByText("Zartech")).toBeVisible();
  expect(errors).toEqual([]);
});

test("deleting a batch needs its code typed", async ({ page }) => {
  const errors = watchErrors(page, [/status of 409/]);
  await page.goto("/batches?new=1");
  const sheet = page.getByRole("dialog", { name: "New batch" });
  await sheet.getByLabel("House").selectOption({ index: 1 });
  await sheet.getByLabel("Breed").fill("Hubbard");
  await sheet.getByLabel("Chicks delivered").fill("100");
  await sheet.getByLabel("Price per chick").fill("800");
  await sheet.getByRole("button", { name: "Place batch" }).click();
  // House 2 already holds a batch, so this asks to confirm first.
  const warning = sheet.getByRole("alert").filter({ hasText: "Check before going ahead" });
  const toast = page.getByText(/^B-\d{4}-\d{2} placed: 100 birds/);
  await expect(warning.or(toast)).toBeVisible();
  if (await warning.isVisible()) await warning.getByRole("button", { name: "Place anyway" }).click();
  await expect(toast).toBeVisible();
  const code = (await toast.textContent())!.split(" ")[0];

  await page.getByRole("link", { name: new RegExp(code) }).click();
  await page.getByRole("button", { name: `${code} actions` }).click();
  await page.getByRole("menuitem", { name: "Delete batch" }).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${code}?` });
  const del = confirm.getByRole("button", { name: "Delete batch" });
  await expect(del).toBeDisabled();
  await confirm.getByRole("textbox").fill(code);
  await del.click();
  await expect(page).toHaveURL("/batches");
  await expect(page.getByRole("link", { name: new RegExp(code) })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe("staff", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("see batches but can't place, edit or delete them", async ({ page }) => {
    await signInAs(page, E2E_USERS.staff.email);
    await page.goto("/batches");
    await expect(page.getByRole("link", { name: new RegExp(E2E_BATCHES[0].code) })).toBeVisible();
    await expect(page.getByRole("button", { name: "New batch" })).toHaveCount(0);
    await page.getByRole("link", { name: new RegExp(E2E_BATCHES[0].code) }).click();
    await expect(page.getByRole("heading", { level: 1, name: E2E_BATCHES[0].code })).toBeVisible();
    await expect(page.getByRole("button", { name: /actions$/ })).toHaveCount(0);
    expect((await page.request.post("/api/batches", { data: {} })).status()).toBe(403);
  });
});
