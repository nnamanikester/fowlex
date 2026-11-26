import { expect, test, type Page } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS } from "./users";

// These start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: Page, email: string, password = E2E_PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("sign in, stay signed in after a refresh, sign out and get sent back to sign in", async ({ page }) => {
  await page.goto("/batches");
  await expect(page).toHaveURL("/auth/login?redirect=%2Fbatches");

  await signIn(page, E2E_USERS.owner.email);
  await expect(page).toHaveURL("/batches");
  await expect(page.getByRole("heading", { level: 1, name: "Batches" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Batches" })).toBeVisible();

  const { isMobile } = test.info().project.use;
  if (isMobile) await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: `Account: ${E2E_USERS.owner.name}` }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/auth/login?reason=signed_out");
  await expect(page.getByText("You've signed out.")).toBeVisible();

  await page.goto("/invoices");
  await expect(page).toHaveURL("/auth/login?redirect=%2Finvoices");
});

test("a wrong password shows the error without saying which field was wrong", async ({ page }) => {
  await page.goto("/auth/login");
  await signIn(page, E2E_USERS.manager.email, "not-the-password");
  const alert = page.getByRole("alert").filter({ hasText: "don't match" });
  await expect(alert).toHaveText(/That email and password don't match/);
  // Nothing under either field points at one of them.
  await expect(page.locator("#email-error, #password-error")).toHaveCount(0);

  // An unknown email gets the very same message.
  await signIn(page, "nobody@fowlex.test", "not-the-password");
  await expect(alert).toHaveText(/That email and password don't match/);
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("forgot password emails a link that sets a new one and signs in", async ({ page, request }) => {
  const email = E2E_USERS.staff.email;
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(`/auth/forgot-password?email=${encodeURIComponent(email)}`);
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const mails = (await (await request.get("/api/dev/outbox")).json()) as { to: string; text: string }[];
  const link = mails.findLast((m) => m.to === email)!.text.match(/https?:\/\/\S+/)![0];

  await page.goto(link);
  await page.getByLabel("New password", { exact: true }).fill("staff-new-password-2026");
  await page.getByRole("button", { name: "Save and sign in" }).click();
  await expect(page).not.toHaveURL(/\/auth\//);

  // The link works once.
  await page.context().clearCookies();
  await page.goto(link);
  await page.getByLabel("New password", { exact: true }).fill("yet-another-password-1");
  await page.getByRole("button", { name: "Save and sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "expired or was already used" })).toBeVisible();

  // And the new password signs in.
  await page.goto("/auth/login");
  await signIn(page, email, "staff-new-password-2026");
  await expect(page).not.toHaveURL(/\/auth\//);
});

test("signing in never sends you to another site", async ({ page }) => {
  await page.goto("/auth/login?redirect=https%3A%2F%2Fevil.example");
  await signIn(page, E2E_USERS.owner.email);
  await expect(page).toHaveURL("/");
});

test("APIs answer 401 without a session", async ({ request }) => {
  const response = await request.get("/api/anything");
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe("unauthenticated");
});
