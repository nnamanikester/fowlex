"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, HandCoins, Landmark, Pencil, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdvanceSheet } from "./advance-sheet";
import { EmployeeSheet, payLine } from "../../_components/employee-sheet";
import { EmptyState, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { formatRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { instalment, monthName } from "@/lib/people/advance-rules";
import type { AdvanceView } from "@/lib/people/advances";
import { PAY_TYPE_LABELS } from "@/lib/people/rules";
import type { EmployeeView } from "@/lib/people/service";
import { formatPhone, maskAccount } from "@/lib/suppliers/rules";

const formatDate = (d: string) => formatRange({ from: d, to: d });

/** One person: their pay and bank account, and the advances they're paying back. */
export function EmployeeDetail({
  employee: e,
  advances,
  batches,
  today,
  canWrite,
  canInvite,
}: {
  employee: EmployeeView;
  advances: AdvanceView[];
  batches: { id: string; code: string }[];
  today: string;
  canWrite: boolean;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<"edit" | "advance" | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const owing = advances.reduce((n, a) => n + a.balanceKobo, 0);
  const done = (message: string) => {
    setOpen(null);
    toast.success(message);
    router.refresh();
  };
  const remove = async (a: AdvanceView) => {
    setRemoving(a.id);
    try {
      await apiRequest(`/api/advances/${a.id}`, "DELETE");
      done(`The ${formatNaira(a.amountKobo)} advance is removed.`);
    } catch (error) {
      toast.error((error as AuthError).message);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5">
      <Link
        href="/people"
        className="focus-ring inline-flex items-center gap-1 rounded-md text-sm font-medium text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-4" aria-hidden /> People
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold text-fg-heading">
            <span className="min-w-0 [overflow-wrap:anywhere]">{e.name}</span>
            {e.status === "left" && <Badge>Left on {formatDate(e.leftOn!)}</Badge>}
            {e.hasLogin && <Badge tone="info">Uses Fowlex</Badge>}
          </h1>
          <p className="text-sm text-fg-muted">
            {e.job || PAY_TYPE_LABELS[e.payType]} · since {formatDate(e.startDate)}
          </p>
        </div>
        {canWrite && (
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => setOpen("edit")}>
              <Pencil /> Edit details
            </Button>
            {e.status === "active" && (
              <Button className="flex-1 sm:flex-none" onClick={() => setOpen("advance")}>
                <HandCoins /> Give an advance
              </Button>
            )}
          </div>
        )}
      </div>

      <Panel>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-fg-muted">Pay</dt>
            <dd className="num font-semibold text-fg">{payLine(e)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-fg-muted">Bank account</dt>
            <dd className="flex items-center gap-1.5 text-fg">
              {e.bank ? (
                <>
                  <Landmark className="size-4 shrink-0 text-fg-muted" aria-hidden />
                  <span className="truncate">
                    {e.bank.bankName} {maskAccount(e.bank.accountNumber)} · {e.bank.accountName}
                  </span>
                </>
              ) : (
                <span className="text-warning-fg">None yet: add one to pay them from here</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Phone</dt>
            <dd>
              {e.phone ? (
                <a
                  href={`tel:${e.phone}`}
                  className="focus-ring inline-flex items-center gap-1.5 rounded font-medium text-brand-fg"
                >
                  <Phone className="size-4" aria-hidden /> {formatPhone(e.phone)}
                </a>
              ) : (
                <span className="text-fg-muted">Not added</span>
              )}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel
        title="Advances"
        description={
          owing > 0
            ? `${formatNaira(owing)} still to come out of their pay.`
            : "Money given ahead of pay comes out of their next pay."
        }
        flush
      >
        {advances.length === 0 ? (
          <EmptyState
            icon={<HandCoins />}
            title="No advances"
            description="Give one here: it's recorded as a labour expense, and payroll takes it back from their pay."
          />
        ) : (
          <ul className="divide-y divide-line">
            {advances.map((a) => {
              const each = Math.min(instalment(a.amountKobo, a.months), a.balanceKobo);
              return (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="num font-semibold text-fg">
                      {formatNaira(a.amountKobo)}{" "}
                      <span className="font-normal text-fg-muted">on {formatDate(a.date)}</span>
                    </p>
                    <p className="text-xs text-fg-muted">
                      {a.balanceKobo === 0
                        ? "Paid back"
                        : `${formatNaira(a.balanceKobo)} left · ${formatNaira(each)} a month from ${monthName(a.firstPeriod)}'s pay`}
                      {a.reason && ` · ${a.reason}`}
                    </p>
                  </div>
                  {a.expense?.paymentStatus !== "paid" && a.expense && (
                    <Link href={`/expenses?open=${a.expense.id}${a.expense.method === "paystack" ? "&pay=1" : ""}`}>
                      <Badge tone="warning">{a.expense.method === "paystack" ? "Not sent yet" : "Not paid"}</Badge>
                    </Link>
                  )}
                  {canWrite && a.repaidKobo === 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove the ${formatNaira(a.amountKobo)} advance`}
                      loading={removing === a.id}
                      onClick={() => void remove(a)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {open === "edit" && (
        <EmployeeSheet
          employee={e}
          batches={batches}
          today={today}
          canInvite={canInvite}
          onClose={() => setOpen(null)}
          onSaved={done}
        />
      )}
      {open === "advance" && (
        <AdvanceSheet
          employee={e}
          today={today}
          onClose={() => setOpen(null)}
          onSaved={(advance) => {
            if (advance.expense?.method === "paystack") {
              setOpen(null);
              router.push(`/expenses?open=${advance.expense.id}&pay=1`);
            } else done(`${formatNaira(advance.amountKobo)} advance to ${e.name} recorded.`);
          }}
        />
      )}
    </div>
  );
}
