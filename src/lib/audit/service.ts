import "server-only";

import type { CurrentUser } from "@/lib/auth/current-user";
import { connectDb } from "@/lib/db";
import { AuditLogModel } from "@/models/audit-log";

/** The farm's latest changes, newest first, for the audit page. */
export async function listAudit(actor: CurrentUser, limit = 1000) {
  await connectDb();
  const rows = await AuditLogModel.find({ farmId: actor.farmId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  return rows.map((r) => ({
    id: String(r._id),
    at: r.createdAt.toISOString(),
    actorName: r.actorName ?? "System",
    action: r.action as "create" | "update" | "delete" | "restore",
    model: r.model,
    label: r.label ?? "",
    changes: (r.changes ?? []).map((c) => ({ field: c.field, before: c.before ?? null, after: c.after ?? null })),
  }));
}

export type AuditRow = Awaited<ReturnType<typeof listAudit>>[number];
