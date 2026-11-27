import { expect, test } from "@playwright/test";

import { signInAs, watchErrors } from "./helpers";
import { E2E_USERS } from "./users";

test("a manager's ₦300,000 expense waits for an owner, who approves one and rejects another with a reason", async ({
  page,
  browser,
  isMobile,
}, info) => {
  const errors = watchErrors(page);
  const tag = `${info.project.name} ${Date.now().toString(36)}`;
  // The manager, on their own phone.
  const managerSide = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const manager = await managerSide.newPage();
  await signInAs(manager, E2E_USERS.manager.email);
  const record = async (description: string) =>
    (
      await manager.request.post("/api/expenses", {
        // Above any limit the suite sets (the settings test sets ₦250,000); the unit tests check ₦250,000
        // against the default ₦100,000.
        data: { category: "repairs", amountKobo: 30_000_000, description, method: "later" },
      })
    ).json();
  const pump = await record(`Borehole pump ${tag}`);
  const roof = await record(`Roof sheets ${tag}`);
  expect(pump.approval).toBe("pending");
  await manager.goto("/expenses");
  await expect(
    manager.getByRole("main").getByRole("button", { name: new RegExp(`Borehole pump ${tag}`) }),
  ).toContainText("Waiting for approval");
  await expect(manager.getByText("Waiting for your approval")).toHaveCount(0);
  await managerSide.close();

  // An owner sees them on the menu and in the queue.
  await page.goto("/expenses");
  const menu = isMobile
    ? page.getByRole("button", { name: "Open menu" })
    : page
        .getByRole("complementary", { name: "Sidebar" })
        .getByRole("link", { name: /^Expenses, \d+ need attention$/ });
  if (isMobile) {
    await menu.click();
    await expect(
      page.getByRole("complementary", { name: "Menu" }).getByRole("link", { name: /^Expenses, \d+ need attention$/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  } else await expect(menu).toBeVisible();
  await expect(page.getByText(/Waiting for your approval \(\d+\)/)).toBeVisible();
  await page.getByRole("button", { name: `Approve ${pump.number}` }).click();
  await expect(page.getByText(`${pump.number} approved.`)).toBeVisible();

  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(`Roof sheets ${tag}`) })
    .last()
    .click();
  const sheet = page.getByRole("dialog", { name: `Roof sheets ${tag}` });
  await sheet.getByRole("button", { name: "Reject" }).click();
  const why = page.getByRole("dialog", { name: `Reject ${roof.number}?` });
  await why.getByRole("button", { name: "Reject" }).click();
  await expect(why.getByText("Say why, so they can put it right.")).toBeVisible();
  await why.getByLabel("Why").fill("Get three quotes first.");
  await why.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText(`${roof.number} rejected.`)).toBeVisible();
  await expect(sheet.getByText("Get three quotes first.", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});
