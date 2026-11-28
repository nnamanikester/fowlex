import { expect, type Locator, type Page } from "@playwright/test";

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

/**
 * Collects console errors and uncaught exceptions; assert it's empty at the end. `expected` lists
 * errors a test causes on purpose (the browser logs a refused request, such as a 409, as an error).
 */
export function watchErrors(page: Page, expected: RegExp[] = []) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && !expected.some((re) => re.test(m.text())) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/**
 * Waits until React has made this element live (hydrated: its event handlers are attached), so a
 * single tap or keystroke lands. Server-drawn HTML shows before it reacts; a tap in between does
 * nothing. Waiting for this, not for time, keeps tests predictable.
 */
export async function ready(locator: Locator) {
  await locator.waitFor();
  const handle = await locator.elementHandle();
  await locator
    .page()
    .waitForFunction((el) => !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$")), handle);
}

/** Waits for a dialog's opening animation to finish, so what's measured is where it comes to rest. */
export async function settled(locator: Locator) {
  await locator.evaluate(async (el) => {
    // Until nothing is still moving. An animation cancelled or replaced (a re-render can restart
    // one) rejects `finished`: it isn't running any more, so that counts as done.
    for (;;) {
      const running = el.getAnimations({ subtree: true }).filter((a) => a.playState === "running");
      if (!running.length) return;
      await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
    }
  });
}
