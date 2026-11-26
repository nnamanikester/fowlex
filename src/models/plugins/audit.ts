import type { ClientSession, HydratedDocument, Query, Schema } from "mongoose";

import { currentActor } from "@/lib/audit/context";
import { type AuditChange, AuditLogModel } from "@/models/audit-log";

export type AuditOptions = {
  /** How the record reads in the log ("Ada Obi (ada@fowlex.com)"). */
  label?: (doc: Record<string, unknown>) => string;
  /** Bookkeeping fields left out entirely (a change to only these writes nothing). */
  exclude?: string[];
  /** Secrets logged as "changed", never their values. */
  redact?: string[];
};

type Plain = Record<string, unknown>;
type Action = "create" | "update" | "delete" | "restore";

const ALWAYS_EXCLUDED = ["_id", "__v", "createdAt", "updatedAt", "farmId", "createdBy"];
export const REDACTED = "•••";

/**
 * Query option for counters the system moves on its own (the invoice number taken for each
 * invoice): `{ skipAudit: true }`. The same field changed by a person is still logged.
 */
export const SKIP_AUDIT = { skipAudit: true } as const;

/** Values as the log stores them: ids and dates as strings, everything else as JSON allows. */
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value ?? null));

/**
 * Logs every create, update, delete and restore of this model to AuditLog, with who made it (from
 * the audit context) and the before and after values of each field that changed. Saves, query
 * updates and hard deletes are all covered; the log row joins the change's transaction, so a
 * rolled-back change leaves no trace. Added to every model by basePlugin.
 */
export function auditPlugin(schema: Schema, options: AuditOptions = {}) {
  const excluded = new Set([...ALWAYS_EXCLUDED, ...(options.exclude ?? [])]);
  const redacted = new Set(options.redact ?? []);

  function diff(before: Plain | null, after: Plain | null): AuditChange[] {
    const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    const changes: AuditChange[] = [];
    for (const field of fields) {
      if (excluded.has(field) || field === "deletedAt") continue;
      const b = plain(before?.[field]);
      const a = plain(after?.[field]);
      if (JSON.stringify(b) === JSON.stringify(a)) continue;
      changes.push(
        redacted.has(field)
          ? { field, before: b === null ? null : REDACTED, after: a === null ? null : REDACTED }
          : { field, before: b, after: a },
      );
    }
    return changes;
  }

  function actionFor(before: Plain | null, after: Plain | null): Action {
    if (!before) return "create";
    if (!after) return "delete";
    if (!before.deletedAt && after.deletedAt) return "delete";
    if (before.deletedAt && !after.deletedAt) return "restore";
    return "update";
  }

  async function write(modelName: string, pairs: [Plain | null, Plain | null][], session?: ClientSession | null) {
    const actor = currentActor();
    const rows = pairs.flatMap(([before, after]) => {
      const action = actionFor(before, after);
      const changes = diff(before, after);
      // An update that only touched bookkeeping isn't worth a row; creates and deletes always are.
      if (action === "update" && !changes.length) return [];
      const doc = (after ?? before)!;
      return [
        {
          farmId: doc.farmId ?? doc._id,
          actorId: actor?.id ?? null,
          actorName: actor?.name ?? "System",
          action,
          model: modelName,
          docId: doc._id,
          label: options.label?.(doc) ?? "",
          changes,
        },
      ];
    });
    // insertMany: plain rows, within the change's transaction when there is one.
    if (rows.length) await AuditLogModel.insertMany(rows as never[], { session: session ?? undefined });
  }

  // Documents: remember how each one looked when loaded (or last saved), then diff on save.
  schema.post("init", function (this: HydratedDocument<Plain>) {
    this.$locals.auditBefore = this.toObject({ depopulate: true });
  });
  schema.pre("save", function (this: HydratedDocument<Plain>) {
    this.$locals.auditWasNew = this.isNew;
  });
  schema.post("save", async function (this: HydratedDocument<Plain>) {
    const before = this.$locals.auditWasNew ? null : ((this.$locals.auditBefore as Plain | undefined) ?? null);
    const after = this.toObject({ depopulate: true });
    const { modelName } = this.constructor as unknown as { modelName: string };
    await write(modelName, [[before, after]], this.$session());
    this.$locals.auditBefore = after;
  });
  schema.post("insertMany", async function (docs: unknown) {
    const list = docs as HydratedDocument<Plain>[];
    const { modelName } = this as unknown as { modelName: string };
    await write(
      modelName,
      list.map((d) => [null, d.toObject({ depopulate: true })]),
      list[0]?.$session(),
    );
  });

  // Queries: read the matching documents before and after the write.
  const before = new WeakMap<object, Plain[]>();
  type Q = Query<unknown, unknown>;
  const session = (q: Q) => (q.getOptions().session as ClientSession | undefined) ?? null;

  for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace"] as const) {
    schema.pre(op, async function (this: Q) {
      if (this.getOptions().skipAudit) return;
      const filter = this.getFilter();
      const found = op === "updateMany" ? this.model.find(filter) : this.model.find(filter).limit(1);
      before.set(this, (await found.setOptions({ withDeleted: true }).session(session(this)).lean()) as Plain[]);
    });
    schema.post(op, async function (this: Q) {
      const old = before.get(this) ?? [];
      if (!old.length) return;
      const ids = old.map((d) => d._id);
      const now = (await this.model
        .find({ _id: { $in: ids } })
        .setOptions({ withDeleted: true })
        .session(session(this))
        .lean()) as Plain[];
      const byId = new Map(now.map((d) => [String(d._id), d]));
      await write(
        this.model.modelName,
        old.map((d) => [d, byId.get(String(d._id)) ?? null]),
        session(this),
      );
    });
  }

  for (const op of ["deleteOne", "deleteMany", "findOneAndDelete"] as const) {
    schema.pre(op, { document: false, query: true }, async function (this: Q) {
      const filter = this.getFilter();
      const found = op === "deleteMany" ? this.model.find(filter) : this.model.find(filter).limit(1);
      before.set(this, (await found.setOptions({ withDeleted: true }).session(session(this)).lean()) as Plain[]);
    });
    schema.post(op, { document: false, query: true }, async function (this: Q) {
      const old = before.get(this) ?? [];
      if (old.length)
        await write(
          this.model.modelName,
          old.map((d) => [d, null]),
          session(this),
        );
    });
  }
}
