import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("give an advance in cash, spread over months: it's a labour expense and shows what's left", async ({
  page,
}, info) => {
  const errors = watchErrors(page);
  const name = `Chidi ${info.project.name} ${Date.now().toString(36)}`;
  const person = await (
    await page.request.post("/api/employees", { data: { name, payType: "monthly", rateKobo: 6_000_000 } })
  ).json();
  await page.goto(`/people/${person.id}`);
  await expect(page.getByRole("main").getByText("No advances")).toBeVisible();
  await page.getByRole("button", { name: "Give an advance" }).click();
  const sheet = page.getByRole("dialog", { name: "Give an advance" });
  // No bank account: cash or transfer only.
  await expect(sheet.getByRole("radio", { name: "Paystack" })).toHaveCount(0);
  await sheet.getByLabel("How much").fill("30000");
  await sheet.getByRole("radio", { name: "3 months" }).click();
  await expect(sheet.getByText(/^₦10,000\.00 comes out of each month's pay, \w+ \d{4} to \w+ \d{4}\.$/)).toBeVisible();
  await sheet.getByLabel("What for").fill("School fees");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`₦30,000.00 advance to ${name} recorded.`)).toBeVisible();
  await expect(page.getByRole("main")).toContainText("₦30,000.00 still to come out of their pay.");
  await expect(page.getByRole("main")).toContainText("₦30,000.00 left · ₦10,000.00 a month from");

  await page.goto("/expenses");
  await expect(page.getByRole("main").getByText(`Salary advance: ${name}`)).toBeVisible();
  await page.goto("/people");
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: name })).toContainText(
    "Advance: ₦30,000.00 to pay back",
  );

  await page.goto(`/people/${person.id}`);
  await page.getByRole("button", { name: "Remove the ₦30,000.00 advance" }).click();
  await expect(page.getByText("The ₦30,000.00 advance is removed.")).toBeVisible();
  await expect(page.getByRole("main").getByText("No advances")).toBeVisible();
  expect(errors).toEqual([]);
});

test("an advance sent through Paystack goes straight on to paying it", async ({ page }, info) => {
  const errors = watchErrors(page);
  const name = `Efe ${info.project.name} ${Date.now().toString(36)}`;
  const person = await (
    await page.request.post("/api/employees", {
      data: { name, payType: "monthly", rateKobo: 6_000_000, bank: { bankCode: "058", accountNumber: "0123456781" } },
    })
  ).json();
  await page.goto(`/people/${person.id}`);
  await page.getByRole("button", { name: "Give an advance" }).click();
  const sheet = page.getByRole("dialog", { name: "Give an advance" });
  await sheet.getByLabel("How much").fill("15000");
  await sheet.getByRole("radio", { name: "Paystack" }).click();
  await expect(sheet.getByText("Sent to Guaranty Trust Bank CHIOMA EZE from Expenses, next.")).toBeVisible();
  await sheet.getByRole("button", { name: "Save and send it" }).click();
  await expect(page).toHaveURL(/\/expenses\?open=.+&pay=1/);
  await expect(page.getByRole("dialog").getByText("CHIOMA EZE").first()).toBeVisible();
  expect(errors).toEqual([]);
});
