import { expect, test, type Page } from "@playwright/test";

import { ready, settled, watchErrors } from "./helpers";

/** Where the open drawer and its footer sit, against the window. */
async function placed(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector("dialog[open]")!;
    const footer = dialog.firstElementChild!.lastElementChild!;
    const box = (e: Element) => e.getBoundingClientRect();
    return { top: box(dialog).top, bottom: box(dialog).bottom, footer: box(footer).bottom, height: innerHeight };
  });
}

// Pages space their sections apart; a drawer opened inside one must still fill the screen's height
// (from the side on a computer, from the bottom on a phone) with its buttons in full view.
test("drawers sit flush with the screen, their buttons in full view", async ({ page, isMobile }) => {
  const errors = watchErrors(page);
  for (const [path, button] of [
    ["/sales", "New order"],
    ["/customers", "Add a customer"],
  ] as const) {
    await page.goto(path);
    const open = page.getByRole("main").getByRole("button", { name: button }).first();
    await ready(open);
    await open.click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    // Measured where it comes to rest, once its opening animation is done.
    await settled(page.locator("dialog[open]"));
    const at = await placed(page);
    if (!isMobile) expect(at.top).toBe(0);
    expect(at.bottom).toBeCloseTo(at.height, 0);
    expect(at.footer).toBeLessThanOrEqual(at.height);
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});
