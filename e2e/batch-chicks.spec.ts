import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("placing a batch records its chicks: owed to the hatchery, one tap from paying, and in its costs", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  await page.request.post("/api/houses", { data: { name: `Chick house ${tag}`, capacity: 5000 } });
  await page.request.post("/api/suppliers", {
    data: { name: `Hatchery ${tag}`, supplies: ["chicks"], bank: { bankCode: "058", accountNumber: "0123456781" } },
  });

  await page.goto("/batches?new=1");
  const sheet = page.getByRole("dialog", { name: "New batch" });
  const house = await sheet
    .getByLabel("House")
    .locator("option", { hasText: `Chick house ${tag}` })
    .getAttribute("value");
  await sheet.getByLabel("House").selectOption(house!);
  await sheet.getByLabel("Breed").fill("Ross 308");
  await sheet.getByLabel("Chicks delivered").fill("500");
  await sheet.getByLabel("Price per chick").fill("900");
  await sheet.getByLabel("Hatchery", { exact: true }).selectOption({ label: `Hatchery ${tag}` });
  await sheet.getByRole("radio", { name: "Owed to the hatchery" }).click();
  await expect(sheet.getByText("An owner can pay the hatchery from there.")).toBeVisible();
  await sheet.getByRole("button", { name: "Place batch" }).click();
  const toast = page.getByText(/^B-\d{4}-\d{2} placed: 500 birds in Chick house/);
  await expect(toast).toBeVisible();
  const code = (await toast.textContent())!.split(" ")[0];

  await page.getByRole("link", { name: new RegExp(code) }).click();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: `Hatchery ${tag}` })).toBeVisible();
  const chicks = main.getByRole("link", { name: /EXP-\d{4}-\d{4}\s*Owed/ });
  await expect(chicks).toBeVisible();

  await page.getByRole("navigation", { name: "Batch sections" }).getByRole("link", { name: "Costs" }).click();
  await expect(main.getByText("₦450,000.00").first()).toBeVisible();
  await expect(main.getByRole("link", { name: new RegExp(`500 day-old chicks for ${code}`) })).toBeVisible();

  await page.getByRole("navigation", { name: "Batch sections" }).getByRole("link", { name: "Overview" }).click();
  await chicks.click();
  const expense = page.getByRole("dialog", { name: `500 day-old chicks for ${code}` });
  await expect(expense.getByRole("button", { name: "Pay ₦450,000.00 with Paystack" })).toBeVisible();
  expect(errors).toEqual([]);
});
