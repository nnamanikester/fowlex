"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, Phone, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Fab, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployeeSheet, payLine } from "./employee-sheet";
import { formatNaira } from "@/lib/money";
import { PAY_TYPE_LABELS } from "@/lib/people/rules";
import type { EmployeeView } from "@/lib/people/service";
import { formatPhone, maskAccount } from "@/lib/suppliers/rules";

/** Everyone who works on the farm, as cards; each opens the person's page. */
export function PeopleBoard({
  employees,
  owing: owingIn = {},
  batches,
  today,
  canWrite,
  canInvite,
}: {
  employees: EmployeeView[];
  /** Advances each person still has to pay back. */
  owing?: Record<string, number>;
  batches: { id: string; code: string }[];
  today: string;
  canWrite: boolean;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const owing = new Map(Object.entries(owingIn));
  const [showLeft, setShowLeft] = React.useState(false);
  const working = employees.filter((e) => e.status === "active");
  const shown = showLeft ? employees : working;
  const monthly = working.filter((e) => e.payType === "monthly").reduce((n, e) => n + e.rateKobo, 0);

  return (
    <div className="space-y-4">
      {employees.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fg-muted">
            <span className="num font-semibold text-fg">{working.length}</span> working here
            {monthly > 0 && (
              <>
                {" · "}
                <span className="num font-semibold text-fg">{formatNaira(monthly)}</span> in monthly salaries
              </>
            )}
          </p>
          {canWrite && (
            <Button size="sm" className="hidden lg:inline-flex" onClick={() => setAdding(true)}>
              <Plus /> Add someone
            </Button>
          )}
        </div>
      )}
      {employees.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Users />}
            title="No one added yet"
            description="Add the people who work on the farm, how they're paid and their bank account, so payroll can pay them from here."
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Plus /> Add someone
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => (
            <li key={e.id} className="relative">
              <Link
                href={`/people/${e.id}`}
                className="focus-ring flex h-full w-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 pb-14 text-left shadow-card hover:border-line-strong"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 space-y-0.5">
                    <span className="block truncate font-display text-lg font-bold text-fg-heading">{e.name}</span>
                    <span className="block text-sm text-fg-muted">{e.job || PAY_TYPE_LABELS[e.payType]}</span>
                  </span>
                  {e.status === "left" ? <Badge>Left</Badge> : e.hasLogin && <Badge tone="info">Uses Fowlex</Badge>}
                </span>
                <span className="num text-sm font-semibold text-fg">{payLine(e)}</span>
                {(owing.get(e.id) ?? 0) > 0 && (
                  <span className="num text-xs text-fg-muted">
                    Advance: {formatNaira(owing.get(e.id)!)} to pay back
                  </span>
                )}
                {e.bank ? (
                  <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <Landmark className="size-3.5" aria-hidden /> {e.bank.bankName} {maskAccount(e.bank.accountNumber)}
                  </span>
                ) : (
                  <span className="text-xs text-warning-fg">No bank account: add one to pay them from here</span>
                )}
              </Link>
              {e.phone && (
                <a
                  href={`tel:${e.phone}`}
                  className="focus-ring absolute bottom-3 left-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-fg hover:bg-brand-subtle"
                >
                  <Phone className="size-4" aria-hidden /> {formatPhone(e.phone)}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {employees.some((e) => e.status === "left") && (
        <button
          type="button"
          className="focus-ring rounded-md text-sm font-medium text-brand-fg"
          onClick={() => setShowLeft((v) => !v)}
        >
          {showLeft ? "Hide people who left" : "Show people who left"}
        </button>
      )}
      {canWrite && <Fab label="Add someone" icon={<Plus />} onClick={() => setAdding(true)} />}
      {adding && (
        <EmployeeSheet
          employee={null}
          batches={batches}
          today={today}
          canInvite={canInvite}
          onClose={() => setAdding(false)}
          onSaved={(message, id) => {
            setAdding(false);
            toast.success(message);
            if (id) router.push(`/people/${id}`);
          }}
        />
      )}
    </div>
  );
}
