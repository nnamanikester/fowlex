import "server-only";

import { randomBytes } from "node:crypto";

import {
  type CategoryInput,
  type CategoryView,
  DEFAULT_CATEGORIES,
  SYSTEM_CATEGORIES,
  tidy,
  validateCategory,
} from "./categories";
import type { CurrentUser } from "@/lib/auth/current-user";
import { HttpError } from "@/lib/auth/guard";
import { connectDb } from "@/lib/db";
import { ExpenseCategoryModel } from "@/models/expense-category";

/** The farm's categories: the built-in ones as the farm has named and budgeted them, then its own. */
export async function listCategories(farmId: string): Promise<CategoryView[]> {
  await connectDb();
  const docs = await ExpenseCategoryModel.find({ farmId }).collation({ locale: "en" }).sort({ name: 1 }).lean();
  const byKey = new Map(docs.map((d) => [d.key, d]));
  const view = (d: (typeof docs)[number], builtIn: boolean): CategoryView => ({
    key: d.key,
    name: d.name,
    monthlyBudgetKobo: d.monthlyBudgetKobo ?? null,
    builtIn,
    archived: d.archived ?? false,
  });
  return [
    ...DEFAULT_CATEGORIES.map((c) => (byKey.has(c.key) ? view(byKey.get(c.key)!, true) : c)),
    ...docs.filter((d) => !d.builtIn).map((d) => view(d, false)),
  ];
}

/** A category an expense can be recorded under now: on the farm's list and not archived. */
export async function assertCategory(farmId: string, key: unknown, { forNew = true } = {}) {
  const found = (await listCategories(farmId)).find((c) => c.key === key);
  if (!found || (forNew && (found.archived || SYSTEM_CATEGORIES.includes(found.key))))
    throw new HttpError(400, "invalid_expense", "Choose what it was for.", "category");
  return found;
}

function clean(input: Record<string, unknown>): CategoryInput {
  const values = {
    name: typeof input.name === "string" ? tidy(input.name) : input.name,
    monthlyBudgetKobo:
      input.monthlyBudgetKobo === "" || input.monthlyBudgetKobo === undefined ? null : input.monthlyBudgetKobo,
    archived: input.archived,
  };
  const errors = validateCategory(values);
  const [field] = Object.keys(errors) as (keyof CategoryInput)[];
  if (field) throw new HttpError(400, "invalid_category", errors[field]!, field);
  return values as CategoryInput;
}

async function assertNameFree(farmId: string, name: string, key?: string) {
  const clash = (await listCategories(farmId)).find(
    (c) => c.key !== key && c.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new HttpError(409, "duplicate_name", `There's already a category called ${clash.name}.`, "name");
}

/** Adds a category of the farm's own. */
export async function createCategory(actor: CurrentUser, input: Record<string, unknown>) {
  const values = clean(input);
  await connectDb();
  await assertNameFree(actor.farmId, values.name);
  await ExpenseCategoryModel.create({
    farmId: actor.farmId,
    createdBy: actor.id,
    key: `c-${randomBytes(4).toString("hex")}`,
    name: values.name,
    nameKey: values.name.toLowerCase(),
    monthlyBudgetKobo: values.monthlyBudgetKobo,
  });
  return listCategories(actor.farmId);
}

/**
 * Renames, budgets or archives a category. Past expenses keep its key, so they follow a new name.
 * Built-in categories can't be archived if Fowlex fills them itself.
 */
export async function updateCategory(actor: CurrentUser, key: string, input: Record<string, unknown>) {
  const values = clean(input);
  await connectDb();
  const current = (await listCategories(actor.farmId)).find((c) => c.key === key);
  if (!current) throw new HttpError(404, "not_found", "That category doesn't exist any more.");
  if (values.archived && SYSTEM_CATEGORIES.includes(key))
    throw new HttpError(409, "system", `Fowlex records ${current.name} itself, so it stays.`);
  await assertNameFree(actor.farmId, values.name, key);
  await ExpenseCategoryModel.updateOne(
    { farmId: actor.farmId, key },
    {
      $set: {
        name: values.name,
        nameKey: values.name.toLowerCase(),
        monthlyBudgetKobo: values.monthlyBudgetKobo,
        archived: values.archived === true,
        builtIn: current.builtIn,
      },
      $setOnInsert: { createdBy: actor.id },
    },
    { upsert: true },
  );
  return listCategories(actor.farmId);
}
