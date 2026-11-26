import { expect, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_BATCHES, E2E_USERS } from "./users";

test.use({ storageState: { cookies: [], origins: [] } });

test("staff log today's numbers on a phone, and a second log for the day is refused", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The daily log is for phones");
  const errors = watchErrors(page, [/status of 409/]);
  await signInAs(page, E2E_USERS.staff.email);
  await expect(page).toHaveURL("/log");

  const started = Date.now();
  const batch = E2E_BATCHES[0];
  await page.getByRole("radio", { name: new RegExp(batch.code) }).click();
  await page.getByRole("button", { name: "One more death" }).click();
  await page.getByRole("button", { name: "One more death" }).click();
  await page.getByRole("button", { name: "One more cull" }).click();
  await page.getByLabel("Feed used (kg)").fill("87.5");
  await expect(page.getByText("= 3.5 bags")).toBeVisible();
  await page.getByRole("button", { name: "Save log for today" }).click();
  await expect(page.getByText(`Logged ${batch.code} for today.`)).toBeVisible();
  // Well under a minute, even for a machine.
  expect(Date.now() - started).toBeLessThan(60_000);

  // The batch is ticked, and the form now edits today's log instead of starting another.
  await expect(page.getByRole("radio", { name: new RegExp(batch.code) }).getByLabel("Logged")).toBeVisible();
  await expect(page.getByText(`${batch.code} is already logged for today. You're editing that log.`)).toBeVisible();
  await expect(page.getByLabel("Deaths")).toHaveValue("2");

  // A second new log for the same day is refused by the server.
  const second = await page.request.post("/api/logs", {
    data: { batchId: await batchId(page, batch.code), date: todayLagos(), deaths: 1, feedKg: 10 },
  });
  expect(second.status()).toBe(409);
  expect((await second.json()).error.code).toBe("already_logged");
  expect(errors).toEqual([]);
});

test("with no signal the log waits on the phone, then sends itself", async ({ page, context, isMobile }) => {
  test.skip(!isMobile, "The daily log is for phones");
  await signInAs(page, E2E_USERS.staff.email);
  const batch = E2E_BATCHES[1];
  await page.getByRole("radio", { name: new RegExp(batch.code) }).click();
  await page.getByRole("radio", { name: "Yesterday" }).click();
  await page.getByLabel("Feed used (kg)").fill("50");

  await context.setOffline(true);
  await page.getByRole("button", { name: /^Save log for/ }).click();
  await expect(page.getByText("No signal: saved on this phone.")).toBeVisible();
  await expect(page.getByText("1 log is saved on this phone, waiting for a signal.")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("The log saved on this phone has been sent.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("waiting for a signal")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: new RegExp(batch.code) }).getByLabel("Logged")).toBeVisible();
});

function todayLagos() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
}

/** A batch's id, from its link on the batches page. */
async function batchId(page: import("@playwright/test").Page, code: string) {
  await page.goto("/batches");
  const href = await page.getByRole("link", { name: new RegExp(code) }).getAttribute("href");
  return href!.split("/").pop()!;
}

test("many batches scroll sideways without widening the page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The daily log is for phones");
  await signInAs(page, E2E_USERS.staff.email);
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1]);
  expect(await page.evaluate(() => window.innerWidth)).toBe(page.viewportSize()!.width);
});
