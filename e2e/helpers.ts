import { expect, type Page } from "@playwright/test";

import { E2E_PASSWORD } from "./users";

/** Signs in on the sign-in page as `email`. */
export async function signIn(page: Page, email: string, password = E2E_PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Goes to the sign-in page, signs in and waits to leave it. */
export async function signInAs(page: Page, email: string) {
  await page.goto("/auth/login");
  await signIn(page, email);
  await expect(page).not.toHaveURL(/\/auth\//);
}

/** Collects console errors and uncaught exceptions; assert it's empty at the end. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
