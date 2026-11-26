import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

const NO_ACCESS = "Your role can't open this page";

test("invite a manager, who accepts, signs in and sees only the manager's menu; a reused link is refused", async ({
  page,
  browser,
  request,
}) => {
  const errors = watchErrors(page);
  const project = test.info().project.name;
  const email = `new-manager-${project}@fowlex.test`;
  const name = `Ngozi ${project}`;

  // The owner invites.
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Invite someone" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite someone" });
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("radio", { name: /Manager/ }).check();
  await dialog.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`Invite sent to ${email}.`)).toBeVisible();
  // Listed under "Waiting to join" (the toast says the email inside a sentence, so match it exactly).
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  const mails = (await (await request.get("/api/dev/outbox")).json()) as { to: string; text: string }[];
  const link = mails.findLast((m) => m.to === email)!.text.match(/https?:\/\/\S+/)![0];

  // The new manager accepts in their own browser.
  const theirs = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const them = await theirs.newPage();
  await them.goto(link);
  await expect(them.getByRole("heading", { name: "Join Fowlex Farms" })).toBeVisible();
  await them.getByLabel("Your name").fill(name);
  await them.getByLabel("Password", { exact: true }).fill("ngozi-password-2026");
  await them.getByRole("button", { name: "Join and sign in" }).click();
  await expect(them).toHaveURL("/");

  // Managers see everything but Settings.
  await them.goto("/settings");
  await expect(them.getByText(NO_ACCESS)).toBeVisible();
  await them.goto("/payroll");
  await expect(them.getByRole("heading", { level: 1, name: "Payroll" })).toBeVisible();

  // The link worked once.
  const again = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const stranger = await again.newPage();
  await stranger.goto(link);
  await expect(stranger.getByRole("heading", { name: "This invite can't be used" })).toBeVisible();
  await expect(stranger.getByText("already been accepted")).toBeVisible();
  await again.close();

  // The owner changes their role: their session ends at once.
  await page.reload();
  await page.getByRole("button", { name: `Manage ${name}` }).click();
  await page.getByRole("menuitem", { name: "Make staff" }).click();
  await expect(page.getByText(`${name} is now staff.`)).toBeVisible();
  await them.reload();
  await expect(them).toHaveURL("/auth/login?reason=expired");
  await theirs.close();

  expect(errors).toEqual([]);
});

test("an invite link that doesn't exist is refused", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/auth/invite?token=not-a-real-token");
  await expect(page.getByRole("heading", { name: "This invite can't be used" })).toBeVisible();
  await context.close();
});
