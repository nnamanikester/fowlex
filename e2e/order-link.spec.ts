import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("turn on the order link, and a buyer orders from it in one go; the farm sees it as an online order", async ({
  page,
  browser,
  isMobile,
}, info) => {
  // Two browsers, the whole way through: give it time on a phone.
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  // Their own number: a phone the farm already knows is matched to that customer.
  const digits = String(Date.now()).slice(-7);
  const phone = `0803 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  // Birds ready now: a batch of this test's own, 40 days old.
  const house = await (
    await page.request.post("/api/houses", { data: { name: `Shop ${tag}`, capacity: 5000 } })
  ).json();
  await page.request.post("/api/batches", {
    data: {
      houseId: house.id,
      placedOn: new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10),
      breed: "Ross 308",
      delivered: 1000,
      pricePerChickKobo: 85_000,
      targetSellAgeDays: 42,
      targetWeightGrams: 2200,
      confirm: true,
    },
  });

  await page.goto("/sales");
  const main = page.getByRole("main");
  const turnOn = main.getByRole("button", { name: "Turn on my order page" });
  if (await turnOn.isVisible()) {
    // One price per bird is all it takes.
    await expect(turnOn).toHaveAttribute("aria-disabled", "true");
    await main.getByLabel("Your price, a bird").fill("7000");
    await turnOn.click();
    await expect(page.getByText("Your order page is on.")).toBeVisible();
    await expect(main.getByRole("heading", { name: "Your order link" })).toBeVisible();
    await expect(main.getByText(/\/order\//).first()).toBeVisible();
    // Some buyers pay by weight: a second price.
    await main.getByRole("button", { name: "Birds at another price? Add one" }).click();
    await main.getByLabel("Name of price 2").fill("By weight");
    await main.getByRole("radiogroup", { name: "Priced" }).nth(1).getByRole("radio", { name: "Per kg" }).click();
    await main.getByLabel("Price 2, a kg").fill("3200");
    await main.getByRole("button", { name: "Save prices" }).click();
    await expect(page.getByText("Prices saved: the page shows them now.")).toBeVisible();
    await expect(main.getByRole("button", { name: "Save prices" })).toBeHidden();
  }
  await expect(main.getByRole("heading", { name: "Your order link" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Copy the order link" })).toBeVisible();
  const link = (await main
    .getByText(/\/order\//)
    .first()
    .textContent())!.trim();

  // The buyer, in their own browser, signed in to nothing.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    ...(isMobile ? { viewport: page.viewportSize()! } : {}),
  });
  const buyer = await context.newPage();
  const buyerErrors = watchErrors(buyer);
  await buyer.goto(link);
  await expect(buyer.getByRole("heading", { level: 1 })).toContainText("broilers ready today");
  await expect(buyer.getByText("from ₦7,000 a bird")).toBeVisible();

  await buyer.getByRole("button", { name: "10", exact: true }).click();
  await expect(buyer.getByLabel("Number of birds")).toHaveValue("10");
  await buyer.getByRole("button", { name: "One bird more" }).click();
  await expect(buyer.getByLabel("Number of birds")).toHaveValue("11");
  await expect(buyer.getByRole("radio", { name: /ready$/ })).toHaveCount(7);
  await buyer.getByRole("button", { name: "Later days" }).click();
  await expect(buyer.getByRole("radio", { name: /ready$/ })).toHaveCount(14);
  // Two prices: per bird is chosen to start with, the total exact; by weight, it's an estimate.
  const which = buyer.getByRole("radiogroup", { name: "Which birds" });
  await expect(which.getByRole("radio", { name: /Live bird/ })).toHaveAttribute("aria-checked", "true");
  await expect(
    buyer
      .getByText(/^₦77,000/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await which.getByRole("radio", { name: /By weight/ }).click();
  await expect(
    buyer
      .getByText(/^About ₦/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await which.getByRole("radio", { name: /Live bird/ }).click();
  await buyer.getByRole("radio", { name: /^Today/ }).click();
  await buyer.getByRole("radio", { name: /I'll collect/ }).click();

  // One button: it says what's missing, where it is.
  await buyer.getByRole("button", { name: "Place order" }).first().click();
  await expect(buyer.getByText("Enter your name.")).toBeVisible();
  await buyer.getByLabel("Your name").fill(`Chidi ${tag}`);
  await buyer.getByLabel("Phone number").fill(phone);
  await buyer.getByLabel("Business name").fill(`Suya Spot ${tag}`);
  await buyer.getByRole("button", { name: "Place order" }).first().click();

  await expect(buyer.getByRole("heading", { name: "Order placed" })).toBeFocused();
  await expect(buyer.getByText(`We'll call you on ${phone} to confirm.`)).toBeVisible();
  const number = (await buyer.getByRole("definition").first().textContent())!.trim();
  expect(number).toMatch(/^SO-\d{4}-\d{4}$/);

  // Coming back, their details are filled in.
  await buyer.getByRole("button", { name: "Order more birds" }).click();
  await expect(buyer.getByText(/Welcome back, Chidi/)).toBeVisible();
  await expect(buyer.getByLabel("Phone number")).toHaveValue(phone);
  if (isMobile) {
    const wide = await buyer.evaluate(() => document.documentElement.scrollWidth);
    expect(wide).toBeLessThanOrEqual(buyer.viewportSize()!.width);
  }
  await context.close();

  // The farm: an online order, with who to call, and an email about it.
  await page.reload();
  const row = main.getByRole("listitem").filter({ hasText: number });
  await expect(row).toContainText("Online");
  await row.getByRole("button").click();
  await expect(page.getByRole("dialog", { name: new RegExp(number) })).toContainText(
    `Ordered online by Chidi ${tag} for Suya Spot ${tag}`,
  );
  const mails = (await (await page.request.get("/api/dev/outbox")).json()) as { subject: string }[];
  expect(mails.some((m) => m.subject.startsWith(`New order: 11 birds for Suya Spot ${tag}`))).toBe(true);
  expect(errors).toEqual([]);
  expect(buyerErrors).toEqual([]);
});
