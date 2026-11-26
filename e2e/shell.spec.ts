import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  ["Overview", "/"],
  ["Batches", "/batches"],
  ["Daily log", "/log"],
  ["Inventory", "/inventory"],
  ["Suppliers", "/suppliers"],
  ["Customers", "/customers"],
  ["Contracts", "/contracts"],
  ["Sales", "/sales"],
  ["Invoices", "/invoices"],
  ["Expenses", "/expenses"],
  ["Reports", "/reports"],
  ["Forecasts", "/forecasts"],
  ["People", "/people"],
  ["Payroll", "/payroll"],
  ["Settings", "/settings"],
] as const;

/** Keyboard shortcuts listen once React has hydrated: retry the first press until one lands. */
async function openPalette(page: Page) {
  const search = page.getByRole("combobox", { name: "Search pages and actions" });
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+K");
    await expect(search).toBeFocused({ timeout: 500 });
  }).toPass();
  return search;
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop layout");

  test("⌘K finds every page", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    for (const [label, path] of PAGES) {
      const search = await openPalette(page);
      await search.fill(label);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("the sidebar shows every page and marks the current one", async ({ page }) => {
    await page.goto("/invoices");
    const sidebar = page.getByRole("complementary", { name: "Sidebar" });
    for (const [label] of PAGES) await expect(sidebar.getByRole("link", { name: label, exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Invoices", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Fowlex Farms");
  });

  test("G then a letter jumps to a page; [ folds the sidebar and it stays folded", async ({ page }) => {
    await page.goto("/");
    await expect(async () => {
      await page.keyboard.press("g");
      await page.keyboard.press("b");
      await expect(page).toHaveURL("/batches", { timeout: 500 });
    }).toPass();

    const sidebar = page.getByRole("complementary", { name: "Sidebar" });
    await page.keyboard.press("[");
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await expect(sidebar).toHaveClass(/w-\[4\.75rem\]/);
    await page.reload();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });

  test("the batch switcher changes batch and remembers it", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/batches");
    await page.getByRole("button", { name: "Batch: B-2026-07. Switch batch" }).click();
    await page.getByRole("menuitem", { name: /B-2026-06/ }).click();
    await expect(page.getByRole("button", { name: "Batch: B-2026-06. Switch batch" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Batch: B-2026-06. Switch batch" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "Phone layout");

  test("the sidebar becomes a drawer with a tab bar along the bottom", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();

    const tabs = page.getByRole("navigation", { name: "Tabs" });
    await expect(tabs).toBeVisible();
    for (const label of ["Overview", "Batches", "Daily log", "Inventory", "More"])
      await expect(tabs.getByText(label, { exact: true })).toBeVisible();

    await tabs.getByRole("link", { name: "Daily log" }).click();
    await expect(page).toHaveURL("/log");

    await tabs.getByRole("button", { name: "More" }).click();
    const drawer = page.getByRole("complementary", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Invoices" }).click();
    await expect(page).toHaveURL("/invoices");
    await expect(drawer).toBeHidden();

    await page.getByRole("button", { name: "Search or jump to" }).click();
    await expect(page.getByRole("combobox", { name: "Search pages and actions" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
