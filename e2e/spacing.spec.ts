import { expect, test } from "@playwright/test";

import { watchErrors } from "./helpers";

const PAGES = [
  "/batches",
  "/log",
  "/inventory",
  "/expenses",
  "/suppliers",
  "/people",
  "/payroll",
  "/customers",
  "/contracts",
  "/sales",
  "/invoices",
  "/settings",
];

// Nothing on a page sits on top of something else you can tap: every button, link and field has
// its own space, on a computer and on a phone.
test("no two controls overlap on any page", async ({ page }) => {
  const errors = watchErrors(page);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    const clashes = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const fixed = (el: Element) => {
        for (let e: Element | null = el; e; e = e.parentElement) {
          const p = getComputedStyle(e).position;
          if (p === "fixed" || p === "sticky") return true;
        }
        return false;
      };
      const els = [
        ...main.querySelectorAll(
          "button, a[href], input:not([type=hidden]), select, textarea, [role=radio], [role=switch]",
        ),
      ]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          // checkVisibility knows content in a closed <details> isn't on screen.
          return (
            r.width > 0 &&
            r.height > 0 &&
            e.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
            !fixed(e)
          );
        })
        .map((e) => ({ e, r: e.getBoundingClientRect() }));
      const out: string[] = [];
      for (let i = 0; i < els.length; i++)
        for (let j = i + 1; j < els.length; j++) {
          const a = els[i],
            b = els[j];
          if (
            a.e.contains(b.e) ||
            b.e.contains(a.e) ||
            a.e.closest("label")?.contains(b.e) ||
            b.e.closest("label")?.contains(a.e)
          )
            continue;
          // A control lying wholly inside another is deliberate layering (a card that is one big
          // link, with its call button in the space it keeps for it); crowding overlaps in part.
          const inside = (p: DOMRect, q: DOMRect) =>
            q.left >= p.left && q.right <= p.right && q.top >= p.top && q.bottom <= p.bottom;
          if (inside(a.r, b.r) || inside(b.r, a.r)) continue;
          const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (x > 1 && y > 1)
            out.push(
              `${(a.e.textContent || a.e.getAttribute("aria-label") || a.e.tagName).trim().slice(0, 30)} ⟷ ${(b.e.textContent || b.e.getAttribute("aria-label") || b.e.tagName).trim().slice(0, 30)}`,
            );
        }
      return out;
    });
    expect(clashes, path).toEqual([]);
  }
  expect(errors).toEqual([]);
});
