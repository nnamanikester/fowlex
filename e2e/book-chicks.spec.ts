import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("book chicks paid ahead, see them to pick up, then pick them up: a short delivery is the hatchery's", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  await page.request.post("/api/houses", { data: { name: `Brooder ${tag}`, capacity: 5000 } });
  await page.request.post("/api/suppliers", { data: { name: `Amo ${tag}`, supplies: ["chicks"] } });

  await page.goto("/batches");
  await page.getByRole("button", { name: "Book chicks" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Book chicks" });
  await sheet.getByLabel("Hatchery").selectOption({ label: `Amo ${tag}` });
  await sheet.getByLabel("How many chicks").fill("1000");
  await sheet.getByLabel("Price per chick").fill("850");
  await expect(sheet.getByText("₦850,000.00")).toBeVisible();
  await sheet.getByRole("button", { name: "Tomorrow" }).click();
  const house = await sheet
    .getByLabel("Into house")
    .locator("option", { hasText: `Brooder ${tag}` })
    .getAttribute("value");
  await sheet.getByLabel("Into house").selectOption(house!);
  await sheet.getByLabel("Breed").fill("Ross 308");
  await expect(sheet.getByRole("radio", { name: /Paid already/ })).toBeChecked();
  await sheet.getByRole("button", { name: "Book chicks" }).click();
  const toast = page.getByText(/^B-\d{4}-\d{2} booked: 1,000 chicks to pick up/);
  await expect(toast).toBeVisible();
  const code = (await toast.textContent())!.split(" ")[0];

  // Waiting to be collected, on Batches and the Overview.
  const card = page.getByRole("main").getByRole("listitem").filter({ hasText: code });
  await expect(card).toContainText(`Amo ${tag} → Brooder ${tag}`);
  await expect(card).toContainText("1,000 chicks · pick up");
  await page.goto("/");
  await expect(page.getByRole("link", { name: new RegExp(`1,000 chicks from Amo ${tag}`) })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(`1,000 chicks from Amo ${tag}`) }).click();

  const pickUp = page.getByRole("dialog", { name: "Chicks picked up" });
  await expect(pickUp.getByLabel("How many came")).toHaveValue("1000");
  await pickUp.getByLabel("How many came").fill("990");
  await pickUp.getByLabel("Free extras").fill("10");
  await expect(pickUp.getByText(`Amo ${tag} owes you 20 chicks.`)).toBeVisible();
  await pickUp.getByRole("button", { name: "Put 990 in the house" }).click();
  await expect(
    page.getByText(new RegExp(`${code} is in Brooder ${tag}: 990 birds. Amo ${tag} owes you 20 chicks.`)),
  ).toBeVisible();

  await page
    .getByRole("link", { name: new RegExp(code) })
    .first()
    .click();
  await expect(page.getByRole("main").getByText("20 chicks owed to you")).toBeVisible();
  await expect(page.getByRole("main").getByText("Day 0", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
