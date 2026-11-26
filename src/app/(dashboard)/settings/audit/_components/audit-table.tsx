"use client";

import * as React from "react";
import { History } from "lucide-react";

import { EmptyState, FilterMenu, Panel } from "@/components/kit";
import { type Column, DataTable } from "@/components/tables/data-table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { describeChange } from "@/lib/audit/format";
import type { AuditRow } from "@/lib/audit/service";

const ACTIONS: Record<AuditRow["action"], { label: string; tone: BadgeTone }> = {
  create: { label: "Created", tone: "success" },
  update: { label: "Changed", tone: "info" },
  delete: { label: "Deleted", tone: "danger" },
  restore: { label: "Restored", tone: "warning" },
};

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});

const COLUMNS: Column<AuditRow>[] = [
  {
    id: "at",
    header: "When",
    cell: (r) => <span className="whitespace-nowrap text-fg-muted">{WHEN.format(new Date(r.at))}</span>,
    sortValue: (r) => r.at,
    csv: (r) => r.at,
  },
  { id: "who", header: "Who", cell: (r) => r.actorName, sortValue: (r) => r.actorName, csv: (r) => r.actorName },
  {
    id: "action",
    header: "Action",
    cell: (r) => <Badge tone={ACTIONS[r.action].tone}>{ACTIONS[r.action].label}</Badge>,
    csv: (r) => ACTIONS[r.action].label,
  },
  {
    id: "record",
    header: "Record",
    cell: (r) => (
      <span>
        <span className="block font-medium">{r.label || r.model}</span>
        <span className="text-xs text-fg-subtle">{r.model}</span>
      </span>
    ),
    sortValue: (r) => r.model,
    csv: (r) => `${r.model}: ${r.label}`,
  },
  {
    id: "changes",
    header: "Changes",
    cell: (r) =>
      r.action === "update" ? (
        <ul className="space-y-0.5 text-xs text-fg-muted">
          {r.changes.slice(0, 3).map((c) => (
            <li key={c.field}>{describeChange(c)}</li>
          ))}
          {r.changes.length > 3 && <li>and {r.changes.length - 3} more</li>}
        </ul>
      ) : (
        <span className="text-xs text-fg-subtle">–</span>
      ),
    csv: (r) => r.changes.map(describeChange).join("; "),
    hideBelow: "md",
  },
];

/** Every change on the farm: who, when, what and how it changed. Owners only. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [who, setWho] = React.useState("");
  const [model, setModel] = React.useState("");
  const people = [...new Set(rows.map((r) => r.actorName))].sort();
  const models = [...new Set(rows.map((r) => r.model))].sort();
  const shown = rows.filter((r) => (!who || r.actorName === who) && (!model || r.model === model));

  if (!rows.length)
    return (
      <Panel>
        <EmptyState
          icon={<History />}
          title="Nothing recorded yet"
          description="Every change anyone makes shows here."
        />
      </Panel>
    );

  return (
    <DataTable
      label="Audit log"
      rows={shown}
      columns={COLUMNS}
      getRowId={(r) => r.id}
      searchPlaceholder="Search changes"
      pageSize={25}
      csv={{ filename: "fowlex-audit-log" }}
      toolbar={
        <>
          <FilterMenu
            label="Who"
            anyLabel="Anyone"
            value={who}
            onChange={setWho}
            options={people.map((p) => ({ value: p, label: p }))}
          />
          <FilterMenu
            label="Record"
            anyLabel="Any"
            value={model}
            onChange={setModel}
            options={models.map((m) => ({ value: m, label: m }))}
          />
        </>
      }
    />
  );
}
