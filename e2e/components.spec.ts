import { expect, test } from "@playwright/test";

/** Step 1.3's check: /design renders every component with no console errors, and they all work. */
test("design page components work with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/design");
  await expect(page.getByRole("heading", { name: "Design system", level: 1 })).toBeVisible();

  // Menu: opens, moves with the keyboard, closes on Escape and gives focus back.
  const menuButton = page.getByRole("button", { name: "Batch actions" });
  await menuButton.click();
  await expect(page.getByRole("menu", { name: "Batch actions" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Start a sale" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(menuButton).toBeFocused();

  // Filter menu: choosing a value relabels the pill.
  await page.getByRole("button", { name: "Status: Overdue" }).click();
  await page.getByRole("menuitem", { name: "Paid" }).click();
  await expect(page.getByRole("button", { name: "Status: Paid" })).toBeVisible();

  // Modal: opens with its title, closes on Escape.
  await page.getByRole("button", { name: "Open a modal" }).click();
  const modal = page.getByRole("dialog", { name: "Record deaths" });
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();

  // Sheet: opens and closes with its button.
  await page.getByRole("button", { name: "Open a sheet" }).click();
  const sheet = page.getByRole("dialog", { name: "Starter feed, 25 kg bag" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();

  // Confirm dialog: the destructive button wakes up only once the batch code is typed.
  await page.getByRole("button", { name: "Confirm a delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this batch?" });
  const del = confirm.getByRole("button", { name: "Delete batch" });
  await expect(del).toBeDisabled();
  await confirm.getByRole("textbox").fill("b-2026-07");
  await expect(del).toBeEnabled();
  await del.click();
  await expect(confirm).toBeHidden();
  // Opening it again starts with an empty box.
  await page.getByRole("button", { name: "Confirm a delete" }).click();
  await expect(confirm.getByRole("textbox")).toHaveValue("");
  await confirm.getByRole("button", { name: "Cancel" }).click();

  // Popover and toast.
  await page.getByRole("button", { name: "What is FCR?" }).click();
  await expect(page.getByRole("dialog", { name: "What is FCR?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Toast" }).click();
  await expect(page.getByText("Expense recorded.")).toBeVisible();

  expect(errors).toEqual([]);
});
