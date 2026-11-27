import { describe, expect, it } from "vitest";

import { assertCategory, createCategory, listCategories, updateCategory } from "./categories-service";
import { categoryName, DEFAULT_CATEGORIES, validateCategory } from "./categories";
import { createExpense, getExpense } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

const TODAY = "2026-11-27";
const owner = (): CurrentUser => ({
  id: String(oid()),
  farmId: String(oid()),
  name: "Ada",
  email: "a@f.com",
  role: "owner",
});
const refusal = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: { status: number; code: string; field?: string }) => ({ status: e.status, code: e.code, field: e.field }),
  );
const transport = { category: "transport", amountKobo: 1_500_000, description: "Feed from Ibadan", method: "cash" };

describe("expense categories", () => {
  it("starts with the built-in categories", async () => {
    expect(await listCategories(owner().farmId)).toEqual(DEFAULT_CATEGORIES);
  });

  it("renames a category without breaking past expenses: they keep its key and take the new name", async () => {
    const a = owner();
    const { expense } = await createExpense(a, transport, {}, TODAY);
    const after = await updateCategory(a, "transport", { name: "Logistics", monthlyBudgetKobo: 5_000_000 });
    expect(after.find((c) => c.key === "transport")).toMatchObject({
      name: "Logistics",
      monthlyBudgetKobo: 5_000_000,
      builtIn: true,
    });
    expect((await getExpense(a.farmId, expense.id))?.category).toBe("transport");
    expect(categoryName(after, "transport")).toBe("Logistics");
    expect(categoryName([], "rent")).toBe("Rent");
    expect(categoryName([], "c-gone")).toBe("Other");
    // Renamed twice: still one category.
    await updateCategory(a, "transport", { name: "Haulage" });
    expect((await listCategories(a.farmId)).filter((c) => c.key === "transport")).toHaveLength(1);
  });

  it("adds the farm's own category, usable for expenses, and refuses a name in use", async () => {
    const a = owner();
    const list = await createCategory(a, { name: "  Security   guards ", monthlyBudgetKobo: 3_000_000 });
    const mine = list.find((c) => !c.builtIn)!;
    expect(mine).toMatchObject({
      name: "Security guards",
      builtIn: false,
      archived: false,
      key: expect.stringMatching(/^c-[a-f\d]{8}$/),
    });
    expect((await createExpense(a, { ...transport, category: mine.key }, {}, TODAY)).expense.category).toBe(mine.key);
    expect(await refusal(createCategory(a, { name: "TRANSPORT" }))).toMatchObject({ status: 409, field: "name" });
    expect(await refusal(updateCategory(a, mine.key, { name: "rent" }))).toMatchObject({ code: "duplicate_name" });
    expect(await refusal(createCategory(a, { name: "" }))).toMatchObject({ field: "name" });
    expect(await refusal(updateCategory(a, "c-nope", { name: "X" }))).toMatchObject({ status: 404 });
    // Another farm can't use it.
    expect(await refusal(createExpense(owner(), { ...transport, category: mine.key }, {}, TODAY))).toMatchObject({
      field: "category",
    });
  });

  it("archives a category: kept on past expenses, not chosen for new ones; Fowlex's own stays", async () => {
    const a = owner();
    await updateCategory(a, "rent", { name: "Rent", archived: true });
    expect(await refusal(createExpense(a, { ...transport, category: "rent" }, {}, TODAY))).toMatchObject({
      field: "category",
    });
    expect(await refusal(createExpense(a, { ...transport, category: "bank-charges" }, {}, TODAY))).toMatchObject({
      field: "category",
    });
    expect(await refusal(updateCategory(a, "bank-charges", { name: "Bank charges", archived: true }))).toMatchObject({
      code: "system",
    });
    expect((await assertCategory(a.farmId, "rent", { forNew: false })).archived).toBe(true);
    await updateCategory(a, "rent", { name: "Rent", archived: false });
    expect((await createExpense(a, { ...transport, category: "rent" }, {}, TODAY)).created).toBe(true);
  });

  it("validates names and budgets", () => {
    expect(validateCategory({ name: "Rent", monthlyBudgetKobo: null })).toEqual({});
    expect(validateCategory({ name: "x".repeat(41) })).toHaveProperty("name");
    expect(validateCategory({ name: "Rent", monthlyBudgetKobo: -1 })).toHaveProperty("monthlyBudgetKobo");
    expect(validateCategory({ name: "Rent", monthlyBudgetKobo: 1.5 })).toHaveProperty("monthlyBudgetKobo");
  });
});
