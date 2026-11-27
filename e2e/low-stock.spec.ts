import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

test("stock used below its reorder level shows on the menu and the overview, and the owners are emailed once", async ({
  page,
  isMobile,
}, info) => {
  const errors = watchErrors(page);
  const name = `Low feed ${info.project.name} ${Date.now().toString(36)}`;
  const item = await (
    await page.request.post("/api/inventory/items", {
      data: { name, category: "feed", unit: "bag", unitKg: 25, reorderLevel: 10 },
    })
  ).json();
  await page.request.post("/api/inventory/movements", {
    data: { itemId: item.id, type: "opening", quantity: 12, unitCostKobo: 1_800_000 },
  });
  await page.request.post("/api/inventory/movements", { data: { itemId: item.id, type: "usage", quantity: 3 } });

  await page.goto("/");
  const card = page.getByRole("main").getByRole("link", { name: new RegExp(name) });
  await expect(card).toContainText("9 bags left");
  await expect(card).toContainText("Reorder below 10 bags");
  const menu = isMobile
    ? page.getByRole("navigation", { name: "Tabs" }).getByRole("link", { name: /Inventory/ })
    : page.getByRole("complementary", { name: "Sidebar" }).getByRole("link", { name: /Inventory/ });
  await expect(menu).toHaveAccessibleName(/Inventory, \d+ need attention/);

  // The daily job tells the owners once, however often it runs.
  const run = () => page.request.get("/api/cron/low-stock", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect((await run()).status()).toBe(200);
  expect((await run()).status()).toBe(200);
  expect((await page.request.get("/api/cron/low-stock")).status()).toBe(401);
  const mails = (await (await page.request.get("/api/dev/outbox")).json()) as { to: string; text: string }[];
  expect(mails.filter((m) => m.text.includes(`- ${name}: 9 bags left`))).toHaveLength(1);
  expect(errors).toEqual([]);
});
