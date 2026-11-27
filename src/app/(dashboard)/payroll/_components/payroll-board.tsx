"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Wallet } from "lucide-react";

import { FormAlert } from "@/components/auth";
import { EmptyState, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { formatNaira } from "@/lib/money";
import { monthName } from "@/lib/people/advance-rules";
import { PAY_STATE_LABELS, type PayState } from "@/lib/payroll/rules";
import type { RunView } from "@/lib/payroll/service";

export const STATE_TONE: Record<PayState, "neutral" | "warning" | "info" | "success"> = {
  draft: "neutral",
  "to-pay": "warning",
  "part-paid": "info",
  paid: "success",
};

const previous = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** Each month's pay, newest first, and starting the next one. */
export function PayrollBoard({
  runs,
  hasPeople,
  today,
  canStart,
}: {
  runs: RunView[];
  hasPeople: boolean;
  today: string;
  canStart: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const thisMonth = today.slice(0, 7);
  // This month, and last month if it was never paid.
  const startable = [thisMonth, previous(thisMonth)].filter((p) => !runs.some((r) => r.period === p));
  if (runs.length && startable.includes(previous(thisMonth)) && runs[0].period > previous(thisMonth)) startable.pop();

  const start = async (period: string) => {
    setBusy(period);
    setFailure(null);
    try {
      const run = await apiRequest<RunView>("/api/payroll", "POST", { period });
      router.push(`/payroll/${run.id}`);
    } catch (e) {
      setFailure(e as AuthError);
      setBusy(null);
    }
  };

  if (!hasPeople && !runs.length)
    return (
      <Panel>
        <EmptyState
          icon={<Wallet />}
          title="No one to pay yet"
          description="Add the people who work on the farm and how they're paid. Payroll works out everyone's pay from there."
          action={
            <LinkButton size="sm" href="/people">
              Go to People
            </LinkButton>
          }
        />
      </Panel>
    );

  return (
    <div className="space-y-4">
      {failure && <FormAlert title={failure.message} />}
      {canStart && hasPeople && startable.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {startable.map((p, i) => (
            <Button
              key={p}
              size="lg"
              variant={i === 0 ? "primary" : "secondary"}
              loading={busy === p}
              onClick={() => void start(p)}
            >
              <Plus /> Work out {monthName(p).split(" ")[0]}&apos;s pay
            </Button>
          ))}
        </div>
      )}
      {runs.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Wallet />}
            title="No pay worked out yet"
            description="Start this month's pay: everyone's pay is worked out from their salary, attendance, batches and advances, for you to check and approve."
          />
        </Panel>
      ) : (
        <Panel flush>
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/payroll/${r.id}`}
                  className="focus-ring flex items-center gap-3 px-5 py-4 hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{monthName(r.period)}</span>
                    <span className="block text-xs text-fg-muted">
                      {r.totals.people === 1 ? "1 person" : `${r.totals.people} people`}
                    </span>
                  </span>
                  <span className="num shrink-0 text-right">
                    <span className="block font-semibold text-fg">{formatNaira(r.totals.netKobo)}</span>
                    <Badge tone={STATE_TONE[r.payState]}>{PAY_STATE_LABELS[r.payState]}</Badge>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
