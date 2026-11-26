import { describe, expect, it } from "vitest";

import { listAudit } from "./service";
import { AuditLogModel } from "@/models/audit-log";
import { oid, setupTestDb } from "@/test/db";

setupTestDb();

describe("listAudit", () => {
  it("lists only this farm's changes, newest first, in plain values", async () => {
    const farmId = oid();
    const docId = oid();
    await AuditLogModel.create({ farmId, action: "create", model: "User", docId, label: "Ada", changes: [] });
    await AuditLogModel.create({
      farmId,
      actorName: "Ada",
      action: "update",
      model: "User",
      docId,
      label: "Ada",
      changes: [{ field: "role", before: "staff", after: "manager" }],
    });
    await AuditLogModel.create({ farmId: oid(), action: "create", model: "User", docId: oid() });

    const rows = await listAudit({ id: "u", farmId: String(farmId), name: "Ada", email: "a@f.com", role: "owner" });
    expect(rows.map((r) => r.action)).toEqual(["update", "create"]);
    expect(rows[0]).toMatchObject({
      actorName: "Ada",
      model: "User",
      label: "Ada",
      changes: [{ field: "role", before: "staff", after: "manager" }],
    });
    expect(rows[1].actorName).toBe("System");
    expect(typeof rows[0].at).toBe("string");
  });
});
