"use client";

import * as React from "react";
import { FileDown, LoaderCircle, Mail, RotateCw } from "lucide-react";

import { DateRangePicker, Panel } from "@/components/kit";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button, buttonClasses } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth/client";
import { type DateRange, formatRange, presetRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import type { Statement } from "@/lib/statements/service";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

const day = (d: string) => formatRange({ from: d, to: d });

/**
 * A customer's statement for any range: what they owed at the start, each invoice and payment
 * with the balance after it, and what they owe at the end. Downloaded as a PDF or emailed to them.
 */
export function StatementPanel({
  customerId,
  hasEmail,
  today,
  canSend,
}: {
  customerId: string;
  hasEmail: boolean;
  today: string;
  canSend: boolean;
}) {
  const [range, setRange] = React.useState<DateRange>(() => presetRange("this-year", today));
  const [attempt, setAttempt] = React.useState(0);
  const [answer, setAnswer] = React.useState<{ key: string; statement?: Statement; error?: string } | null>(null);
  const send = useAction();
  const key = `${range.from}|${range.to}|${attempt}`;
  const query = `from=${range.from}&to=${range.to}`;

  React.useEffect(() => {
    let live = true;
    apiRequest<Statement>(`/api/customers/${customerId}/statement?${query}`, "GET").then(
      (statement) => live && setAnswer({ key, statement }),
      (e: { message: string }) => live && setAnswer({ key, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [customerId, query, key]);

  const current = answer?.key === key ? answer : null;
  const s = current?.statement;
  return (
    <Panel
      title="Statement"
      description="What they owed, were billed and paid over a period."
      actions={<DateRangePicker value={range} onChange={setRange} label="Statement period" align="end" />}
      flush
    >
      {!current ? (
        <p role="status" className="flex items-center gap-2 px-5 py-6 text-sm text-fg-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Working out the statement…
        </p>
      ) : current.error ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 px-5 py-6 text-sm text-danger-fg">
          {current.error}
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="focus-ring inline-flex items-center gap-1 rounded font-semibold text-brand-fg"
          >
            <RotateCw className="size-3.5" aria-hidden /> Try again
          </button>
        </p>
      ) : (
        s && (
          <>
            <ul className="divide-y divide-line text-sm">
              <Line date={s.range.from} label="Owed at the start" balance={s.openingKobo} muted />
              {s.entries.map((e, i) => (
                <Line
                  key={i}
                  date={e.date}
                  label={e.description}
                  amount={e.debitKobo ? formatNaira(e.debitKobo) : `−${formatNaira(e.creditKobo)}`}
                  credit={!!e.creditKobo}
                  balance={e.balanceKobo}
                />
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
              <p className="num text-sm text-fg-muted">
                Billed {formatNaira(s.billedKobo)} · paid {formatNaira(s.paidKobo)}
                <span className="block text-base font-semibold text-fg">
                  Owed at the end: {formatNaira(s.closingKobo)}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/customers/${customerId}/statement/pdf?${query}`}
                  download
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  <FileDown /> PDF
                </a>
                {canSend && (
                  <Button
                    size="sm"
                    loading={send.busy}
                    disabled={!hasEmail}
                    reason="Add their email to send statements."
                    onClick={() =>
                      void send.run(
                        () => apiRequest<{ to: string }>(`/api/customers/${customerId}/statement/email`, "POST", range),
                        { success: (r) => `Statement sent to ${r.to}.` },
                      )
                    }
                  >
                    <Mail /> Email it
                  </Button>
                )}
              </div>
            </div>
            <div className="px-5 pb-4 empty:hidden">
              <ActionFeedback action={send} />
            </div>
          </>
        )
      )}
    </Panel>
  );
}

function Line({
  date,
  label,
  amount,
  credit,
  balance,
  muted,
}: {
  date: string;
  label: string;
  amount?: string;
  credit?: boolean;
  balance: number;
  muted?: boolean;
}) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 px-5 py-2.5">
      <span className="num text-xs text-fg-muted">{day(date)}</span>
      <span className={cn("min-w-0", muted ? "text-fg-muted" : "text-fg")}>
        {label}
        {amount && (
          <span className={cn("num block text-xs", credit ? "text-success-fg" : "text-fg-muted")}>{amount}</span>
        )}
      </span>
      <span className="num text-right font-semibold text-fg">{formatNaira(balance)}</span>
    </li>
  );
}
