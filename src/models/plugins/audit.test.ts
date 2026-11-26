import { model, Schema, type Model, type Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { REDACTED } from "./audit";
import { basePlugin, type SoftDeleteMethods } from "./base";
import { runAs } from "@/lib/audit/context";
import { withTransaction } from "@/lib/db";
import { AuditLogModel } from "@/models/audit-log";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

// A stand-in for the Expense model (step 4.2), audited the way real models are.
type Expense = { farmId: Types.ObjectId; payee: string; amountKobo: number; pin?: string; views?: number };
const schema = new Schema({ payee: String, amountKobo: Number, pin: String, views: Number });
schema.plugin(basePlugin, {
  audit: { label: (e) => `${e.payee}`, exclude: ["views"], redact: ["pin"] },
});
const Expense = model("TestAuditExpense", schema) as unknown as Model<Expense, object, SoftDeleteMethods>;

const farmId = oid();
const ada = { id: String(oid()), name: "Ada Owner" };
const logs = () => AuditLogModel.find().sort({ createdAt: 1, _id: 1 }).lean();

describe("audit log", () => {
  it("editing an expense writes one audit row showing the old and new amounts", async () => {
    const expense = await runAs(ada, () => Expense.create({ farmId, payee: "Okada transport", amountKobo: 1_500_000 }));
    const loaded = (await Expense.findById(expense._id))!;
    loaded.amountKobo = 1_800_000;
    await runAs(ada, () => loaded.save());

    const rows = await logs();
    expect(rows.map((r) => r.action)).toEqual(["create", "update"]);
    const update = rows[1];
    expect(update).toMatchObject({
      farmId,
      actorName: "Ada Owner",
      model: "TestAuditExpense",
      docId: expense._id,
      label: "Okada transport",
    });
    expect(String(update.actorId)).toBe(ada.id);
    expect(update.changes).toEqual([{ field: "amountKobo", before: 1_500_000, after: 1_800_000 }]);
  });

  it("records creates in full, and skips saves that change nothing worth logging", async () => {
    const expense = await Expense.create({ farmId, payee: "Feed", amountKobo: 100 });
    const [created] = await logs();
    expect(created).toMatchObject({ action: "create", actorName: "System", actorId: null });
    expect(created.changes).toEqual(
      expect.arrayContaining([
        { field: "payee", before: null, after: "Feed" },
        { field: "amountKobo", before: null, after: 100 },
      ]),
    );

    await expense.save(); // Nothing changed.
    expense.views = 7; // Excluded bookkeeping.
    await expense.save();
    expect(await AuditLogModel.countDocuments()).toBe(1);
  });

  it("never stores a redacted field's value", async () => {
    const expense = await Expense.create({ farmId, payee: "Vet", amountKobo: 5, pin: "1234" });
    expense.pin = "9999";
    await expense.save();
    const [create, update] = await logs();
    expect(create.changes).toContainEqual({ field: "pin", before: null, after: REDACTED });
    expect(update.changes).toEqual([{ field: "pin", before: REDACTED, after: REDACTED }]);
    expect(JSON.stringify(await logs())).not.toMatch(/1234|9999/);
  });

  it("logs soft delete and restore", async () => {
    const expense = await Expense.create({ farmId, payee: "Diesel", amountKobo: 900 });
    await runAs(ada, () => expense.softDelete());
    await runAs(ada, () => expense.restore());
    expect((await logs()).map((r) => r.action)).toEqual(["create", "delete", "restore"]);
  });

  it("logs query updates per document, and hard deletes", async () => {
    await Expense.create([
      { farmId, payee: "A", amountKobo: 1 },
      { farmId, payee: "B", amountKobo: 2 },
    ]);
    await AuditLogModel.deleteMany({});
    await runAs(ada, () => Expense.updateMany({}, { $inc: { amountKobo: 10 } }));
    await runAs(ada, () => Expense.updateOne({ payee: "A" }, { payee: "A2" }));
    await runAs(ada, () => Expense.deleteOne({ payee: "B" }));

    const rows = await logs();
    // updateMany writes one row per document, in whatever order MongoDB read them.
    expect(
      rows
        .slice(0, 2)
        .map((r) => [r.action, r.label])
        .sort(),
    ).toEqual([
      ["update", "A"],
      ["update", "B"],
    ]);
    expect(rows.slice(2).map((r) => [r.action, r.label])).toEqual([
      ["update", "A2"],
      ["delete", "B"],
    ]);
    expect(rows.find((r) => r.label === "A")!.changes).toEqual([{ field: "amountKobo", before: 1, after: 11 }]);
    expect(rows[2].changes).toEqual([{ field: "payee", before: "A", after: "A2" }]);
  });

  it("leaves no row when the change's transaction rolls back", async () => {
    await expect(
      withTransaction(async (session) => {
        await Expense.create([{ farmId, payee: "Rolled back", amountKobo: 1 }], { session });
        throw new Error("Stock movement failed");
      }),
    ).rejects.toThrow();
    expect(await AuditLogModel.countDocuments()).toBe(0);
  });

  it("logs insertMany as one create per document", async () => {
    await runAs(ada, () =>
      Expense.insertMany([
        { farmId, payee: "Chicks", amountKobo: 10 },
        { farmId, payee: "Vaccines", amountKobo: 20 },
      ]),
    );
    const rows = await logs();
    expect(rows.map((r) => [r.action, r.label, r.actorName])).toEqual([
      ["create", "Chicks", "Ada Owner"],
      ["create", "Vaccines", "Ada Owner"],
    ]);
  });
});
