import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

test.use({ storageState: { cookies: [], origins: [] } });

test("a manager adds a ₦15,000 transport expense with a receipt photo from a phone, then finds and exports it", async ({
  page,
  isMobile,
}, info) => {
  test.skip(!isMobile, "The plan's check is on a phone");
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  await signInAs(page, E2E_USERS.manager.email);
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Spend money" }).last().click();
  const sheet = page.getByRole("dialog", { name: "Spend money" });
  await sheet.getByRole("radio", { name: "Other expense" }).click();
  await sheet.getByRole("radio", { name: "Transport" }).click();
  await sheet.getByLabel("Amount").fill("15000");
  await sheet.getByLabel("For", { exact: true }).fill(`Feed run ${tag}`);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  await sheet.locator('input[type="file"]').setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/EXP-\d{4}-\d{4} recorded\./)).toBeVisible();

  await page.getByLabel("Search expenses").fill(`feed run ${tag}`);
  const row = page.getByRole("main").getByRole("button", { name: new RegExp(`Feed run ${tag}`) });
  await expect(row).toContainText("₦15,000.00");
  await expect(row).toContainText("receipt");
  await expect(page.getByText("1 expense · ₦15,000.00")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  expect(csv).toContain(`"Feed run ${tag}"`);
  expect(csv).toContain(",15000,");
  expect(errors).toEqual([]);
});
