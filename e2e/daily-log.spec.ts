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

test("a week's numbers are logged in one go, and its days can't be logged again", async ({
  page,
  isMobile,
  playwright,
}) => {
  test.skip(!isMobile, "The daily log is for phones");
  const errors = watchErrors(page);
  // A batch of its own, placed by the owner a month ago, so no other test's logs are in its weeks.
  const owner = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: "playwright/.auth/owner.json",
  });
  const house = await (
    await owner.post("/api/houses", { data: { name: `Week log ${Date.now().toString(36)}`, capacity: 5000 } })
  ).json();
  const placed = new Date(`${todayLagos()}T00:00:00Z`);
  placed.setUTCDate(placed.getUTCDate() - 30);
  const made = await (
    await owner.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: placed.toISOString().slice(0, 10),
        breed: "Ross 308",
        delivered: 500,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  const batch: { code: string } = made.batch ?? made;
  await owner.dispose();

  await signInAs(page, E2E_USERS.staff.email);
  await page.getByRole("radio", { name: new RegExp(batch.code) }).click();
  await page.getByRole("radio", { name: "A week" }).click();
  await page.getByRole("radio", { name: /^Last week/ }).click();
  await expect(page.getByText("Enter the totals for the whole week.")).toBeVisible();
  await page.getByLabel(/^Deaths \(all 7 days\)/).fill("12");
  await page.getByLabel(/^Feed used \(kg\) \(all 7 days\)/).fill("420");
  await page.getByRole("button", { name: "Save log for last week" }).click();
  await expect(page.getByText(`Logged ${batch.code} for last week.`)).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Last week/ }).getByLabel("Logged")).toBeVisible();

  // A day inside it points back to the week's log.
  await page.getByRole("radio", { name: "A day" }).click();
  const inWeek = new Date(`${todayLagos()}T00:00:00Z`);
  inWeek.setUTCDate(inWeek.getUTCDate() - ((inWeek.getUTCDay() + 6) % 7) - 3);
  await page.getByLabel("Date").fill(inWeek.toISOString().slice(0, 10));
  await expect(page.getByText(/This day is in the log for/)).toBeVisible();
  await page.getByRole("button", { name: "Open it" }).click();
  await expect(page.getByText(/is already logged for .* You're editing that log\./)).toBeVisible();
  await expect(page.getByLabel(/^Deaths/)).toHaveValue("12");
  expect(errors).toEqual([]);
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
  await expect(page.getByRole("radiogroup", { name: "Batch" })).toBeVisible();
  const width = page.viewportSize()!.width;
  // Anything poking out past the screen (the batch chips scroll inside their own row).
  const sticking = await page.evaluate(
    (w) =>
      [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((e) => e.getBoundingClientRect().right > w + 0.5 && !e.closest("[role=radiogroup]"))
        .map((e) => `${e.tagName}.${String(e.className).slice(0, 80)}`),
    width,
  );
  expect(sticking).toEqual([]);
  expect(await page.evaluate(() => window.innerWidth)).toBe(width);
});

test("vaccines given and other things used go in the log: on the health record, off stock", async ({
  page,
  isMobile,
  playwright,
}) => {
  test.skip(!isMobile, "The daily log is for phones");
  const errors = watchErrors(page);
  // A batch of its own (24 days old: the Gumboro booster is due) and stock of its own.
  const tag = Date.now().toString(36);
  const owner = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: "playwright/.auth/owner.json",
  });
  const house = await (await owner.post("/api/houses", { data: { name: `Supplies ${tag}`, capacity: 5000 } })).json();
  const placed = new Date(`${todayLagos()}T00:00:00Z`);
  placed.setUTCDate(placed.getUTCDate() - 24);
  const made = await (
    await owner.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: placed.toISOString().slice(0, 10),
        breed: "Ross 308",
        delivered: 500,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  const batch: { id: string; code: string } = made.batch ?? made;
  const stocked = async (name: string, category: string, unit: string) => {
    const item = await (await owner.post("/api/inventory/items", { data: { name, category, unit } })).json();
    await owner.post("/api/inventory/movements", {
      data: { itemId: item.id, type: "opening", quantity: 10, unitCostKobo: 100_000, date: todayLagos() },
    });
    return item as { id: string; name: string };
  };
  const vaccine = await stocked(`Gumboro vaccine ${tag}`, "vaccine", "vial");
  const drug = await stocked(`Amprolium ${tag}`, "medication", "sachet");
  await owner.dispose();

  await signInAs(page, E2E_USERS.staff.email);
  await page.goto(`/log?batch=${batch.id}`);
  await expect(page.getByRole("radio", { name: new RegExp(batch.code) })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("checkbox", { name: /Gumboro booster given/ }).check();
  await page.getByLabel("Gumboro booster from stock").selectOption(vaccine.id);
  await page.getByLabel("Gumboro booster used").fill("1");
  await page.getByRole("button", { name: "Add something used" }).click();
  await page.getByLabel("Thing used 1", { exact: true }).selectOption({ label: drug.name });
  await page.getByLabel("How much of thing 1").fill("3");
  await expect(page.getByText("sachets · 10 sachets left")).toBeVisible();
  await page.getByLabel("Feed used (kg)").fill("50");
  await page.getByRole("button", { name: /^Save log for/ }).click();
  await expect(page.getByText(`Logged ${batch.code} for today.`)).toBeVisible();

  // The dose is on the health record (no longer due), and both came off stock.
  await expect(page.getByRole("checkbox", { name: /Gumboro booster given/ })).toHaveCount(0);
  await page.reload();
  await page.getByLabel("Thing used 1", { exact: true }).waitFor();
  await expect(page.getByLabel("How much of thing 1")).toHaveValue("3");
  await expect(page.getByText("sachets · 7 sachets left")).toBeVisible();
  expect(errors).toEqual([]);
});

test("every part of a log is there to fill, even with nothing due and nothing in the store", async ({
  page,
  isMobile,
  playwright,
}) => {
  test.skip(!isMobile, "The daily log is for phones");
  const errors = watchErrors(page);
  // A new batch of its own, 2 days old.
  const tag = Date.now().toString(36);
  const owner = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: "playwright/.auth/owner.json",
  });
  const house = await (await owner.post("/api/houses", { data: { name: `Everything ${tag}`, capacity: 5000 } })).json();
  const placed = new Date(`${todayLagos()}T00:00:00Z`);
  placed.setUTCDate(placed.getUTCDate() - 2);
  const made = await (
    await owner.post("/api/batches", {
      data: {
        houseId: house.id,
        placedOn: placed.toISOString().slice(0, 10),
        breed: "Ross 308",
        delivered: 300,
        pricePerChickKobo: 85_000,
        targetSellAgeDays: 42,
        targetWeightGrams: 2200,
        confirm: true,
      },
    })
  ).json();
  const batch: { id: string; code: string } = made.batch ?? made;
  await owner.dispose();

  await signInAs(page, E2E_USERS.staff.email);
  await page.goto(`/log?batch=${batch.id}`);
  await expect(page.getByRole("radio", { name: new RegExp(batch.code) })).toHaveAttribute("aria-checked", "true");
  // Nothing folded away: weighing, birds taken, vaccines and medicine, other things used.
  await expect(page.getByLabel("Average weight (kg)")).toBeVisible();
  await expect(page.getByText("Birds taken for sale")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vaccines and medicine" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Other things used" })).toBeVisible();

  // A medicine given, typed by name.
  await page.getByRole("button", { name: "Add a vaccine or medicine given" }).click();
  await page.getByLabel("Given 1", { exact: true }).fill(`Amprolium ${tag}`);
  await page.getByRole("radio", { name: "Medicine" }).click();
  await page.getByLabel("Average weight (kg)").fill("0.06");
  await page.getByLabel("Feed used (kg)").fill("6");
  await page.getByRole("button", { name: /^Save log for/ }).click();
  await expect(page.getByText(`Logged ${batch.code} for today.`)).toBeVisible();
  // The form is ready for the next one; the medicine is on the batch's health record.
  await expect(page.getByLabel("Given 1", { exact: true })).toHaveCount(0);
  const health = (await (await page.request.get(`/api/health?batchId=${batch.id}`)).json()) as {
    product: string;
    kind: string;
  }[];
  expect(health.map((e) => [e.product, e.kind])).toEqual([[`Amprolium ${tag}`, "medication"]]);
  expect(errors).toEqual([]);
});
