import { describe, expect, it, vi } from "vitest";

import { createAsset, deleteAsset, disposeAsset, listAssets, updateAsset } from "./service";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createExpense, deleteExpense } from "@/lib/expenses/service";
import { AssetModel } from "@/models/asset";
import { ExpenseModel } from "@/models/expense";
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
const generator = {
  name: " Perkins   generator ",
  kind: "generator",
  costKobo: 60_000_000,
  purchasedOn: "2026-01-10",
  usefulLifeMonths: 24,
};

describe("equipment", () => {
  it("adds a ₦600,000 generator costing ₦25,000 a month, and values what's left", async () => {
    const a = owner();
    const asset = await createAsset(a, generator, TODAY);
    expect(asset).toMatchObject({
      name: "Perkins generator",
      salvageKobo: 0,
      status: "in-use",
      monthlyKobo: 2_500_000,
      bookValueKobo: 60_000_000 - 11 * 2_500_000,
      expenseId: null,
    });
    expect((await listAssets(a.farmId, TODAY)).map((x) => x.name)).toEqual(["Perkins generator"]);
    expect(await refusal(createAsset(a, { ...generator, usefulLifeMonths: 0 }, TODAY))).toMatchObject({
      field: "usefulLifeMonths",
    });
    expect((await createAsset(a, { ...generator, purchasedOn: "" }, TODAY)).purchasedOn).toBe(TODAY);
  });

  it("edits, refuses stale forms, and records a sale that stops its depreciation", async () => {
    const a = owner();
    const asset = await createAsset(a, generator, TODAY);
    const saved = await updateAsset(a, asset.id, { ...generator, usefulLifeMonths: 12, salvageKobo: 0 }, 0, TODAY);
    expect(saved).toMatchObject({ usefulLifeMonths: 12, monthlyKobo: 5_000_000, version: 1 });
    expect(await refusal(updateAsset(a, asset.id, generator, 0, TODAY))).toMatchObject({ code: "stale" });
    expect(await refusal(disposeAsset(a, asset.id, { status: "lost" }, TODAY))).toMatchObject({ field: "status" });
    expect(await refusal(disposeAsset(a, asset.id, { status: "sold", disposedOn: "2025-01-01" }, TODAY))).toMatchObject(
      { field: "disposedOn" },
    );
    expect(await refusal(disposeAsset(a, asset.id, { status: "sold", proceedsKobo: -1 }, TODAY))).toMatchObject({
      field: "proceedsKobo",
    });
    const sold = await disposeAsset(
      a,
      asset.id,
      { status: "sold", disposedOn: "2026-10-31", proceedsKobo: 10_000_000 },
      TODAY,
    );
    expect(sold).toMatchObject({ status: "sold", proceedsKobo: 10_000_000, bookValueKobo: 0, monthlyKobo: 0 });
    expect(await refusal(disposeAsset(a, asset.id, { status: "scrapped" }, TODAY))).toMatchObject({ code: "disposed" });
    const scrapped = await disposeAsset(
      a,
      (await createAsset(a, generator, TODAY)).id,
      { status: "scrapped", proceedsKobo: 5 },
      TODAY,
    );
    expect(scrapped).toMatchObject({ disposedOn: TODAY, proceedsKobo: 0 });
  });

  it("deletes equipment added by hand, and refuses a save that loses a race", async () => {
    const a = owner();
    const asset = await createAsset(a, generator, TODAY);
    const lost = Object.assign(new Error("No matching document"), { name: "VersionError" });
    const save = vi.spyOn(AssetModel.prototype, "save").mockRejectedValueOnce(lost);
    expect(await refusal(updateAsset(a, asset.id, generator, 0, TODAY))).toMatchObject({ code: "stale" });
    save.mockRejectedValueOnce(new Error("disk full"));
    await expect(updateAsset(a, asset.id, generator, 0, TODAY)).rejects.toThrow("disk full");
    save.mockRestore();
    await deleteAsset(a, asset.id);
    expect(await listAssets(a.farmId, TODAY)).toEqual([]);
    expect(await refusal(deleteAsset(a, asset.id))).toMatchObject({ status: 404 });
  });
});

describe("equipment bought through Spend money", () => {
  const spend = (asset: Record<string, unknown> | undefined) => ({
    category: "equipment",
    amountKobo: 60_000_000,
    description: "Perkins generator",
    method: "cash",
    date: "2026-11-02",
    asset,
  });

  it("is made with its expense (marked capital), keeps the expense's cost and day, and goes with it", async () => {
    const a = owner();
    const { expense } = await createExpense(
      a,
      spend({ name: "Perkins generator", kind: "generator", usefulLifeMonths: 24 }),
      {},
      TODAY,
    );
    expect(expense.capital).toBe(true);
    const [asset] = await listAssets(a.farmId, TODAY);
    expect(asset).toMatchObject({
      costKobo: 60_000_000,
      purchasedOn: "2026-11-02",
      expenseId: expense.id,
      monthlyKobo: 2_500_000,
    });
    const edited = await updateAsset(
      a,
      asset.id,
      { ...asset, costKobo: 1, purchasedOn: "2026-01-01", usefulLifeMonths: 12 },
      0,
      TODAY,
    );
    expect(edited).toMatchObject({ costKobo: 60_000_000, purchasedOn: "2026-11-02", usefulLifeMonths: 12 });
    expect(await refusal(deleteAsset(a, asset.id))).toMatchObject({ code: "has_expense" });
    await deleteExpense(a, expense.id);
    expect(await listAssets(a.farmId, TODAY)).toEqual([]);
  });

  it("is checked before anything is saved, and only for equipment bought outright", async () => {
    const a = owner();
    expect(
      await refusal(createExpense(a, spend({ name: "Generator", kind: "generator", usefulLifeMonths: 0 }), {}, TODAY)),
    ).toMatchObject({
      field: "asset.usefulLifeMonths",
    });
    expect(await ExpenseModel.countDocuments({ farmId: a.farmId })).toBe(0);
    const { expense } = await createExpense(
      a,
      { ...spend({ kind: "generator", usefulLifeMonths: 24 }), category: "repairs" },
      {},
      TODAY,
    );
    expect(expense.capital).toBe(false);
    expect((await createExpense(a, spend(undefined), {}, TODAY)).expense.capital).toBe(false);
    expect(await listAssets(a.farmId, TODAY)).toEqual([]);
  });
});
