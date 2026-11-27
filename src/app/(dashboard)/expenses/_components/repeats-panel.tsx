"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/auth";
import { Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { formatRange } from "@/lib/dates";
import { type CategoryView, categoryName } from "@/lib/expenses/categories";
import { formatNaira } from "@/lib/money";
import type { RecurringView } from "@/lib/recurring/service";
import { ordinal } from "@/lib/recurring/rules";

const day = (d: string) => formatRange({ from: d, to: d });

/** Monthly repeats (rent, security, internet): when each is next made, and changing or stopping it. */
export function RepeatsPanel({
  recurring,
  categories,
  canWrite,
}: {
  recurring: RecurringView[];
  categories: CategoryView[];
  canWrite: boolean;
}) {
  const [editing, setEditing] = React.useState<RecurringView | null>(null);
  if (!recurring.length) return null;
  const monthly = recurring.filter((r) => r.active).reduce((n, r) => n + r.amountKobo, 0);
  return (
    <>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Repeat className="size-4 text-fg-muted" aria-hidden /> Repeats every month
          </span>
        }
        description={`${formatNaira(monthly)} a month, made on the day each is due.`}
        flush
      >
        <ul className="divide-y divide-line">
          {recurring.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => setEditing(r)}
                className="focus-ring flex w-full items-center gap-3 px-5 py-3 text-left enabled:hover:bg-surface-subtle"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-fg">{r.description}</span>
                    {!r.active && <Badge>Stopped</Badge>}
                  </span>
                  <span className="block text-xs text-fg-muted">
                    {categoryName(categories, r.category)} ·{" "}
                    {r.active ? `next on ${day(r.nextDue)}` : `was on the ${ordinal(r.dayOfMonth)}`}
                  </span>
                </span>
                <span className="num shrink-0 font-semibold text-fg">{formatNaira(r.amountKobo)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {editing && <RepeatSheet key={editing.id} repeat={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RepeatSheet({ repeat, onClose }: { repeat: RecurringView; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = React.useState<number | null>(repeat.amountKobo);
  const [dayOfMonth, setDayOfMonth] = React.useState(String(repeat.dayOfMonth));
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const save = async (change: Record<string, unknown>, message: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await apiRequest(`/api/recurring/${repeat.id}`, "PATCH", change);
      toast.success(message);
      router.refresh();
      onClose();
    } catch (e) {
      setFailure(e as AuthError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title={repeat.description}
      subtitle="Repeats every month"
      footer={
        <div className="space-y-2">
          <ActionFeedback action={{ failure }} />
          <Button
            size="lg"
            fullWidth
            loading={busy}
            onClick={() =>
              void save({ amountKobo: amount, dayOfMonth: Number(dayOfMonth) }, `${repeat.description} saved.`)
            }
          >
            Save changes
          </Button>
          <Button
            variant="ghost"
            fullWidth
            disabled={busy}
            onClick={() =>
              void save(
                { active: !repeat.active },
                repeat.active ? `${repeat.description} stopped.` : `${repeat.description} repeats again.`,
              )
            }
          >
            {repeat.active ? "Stop repeating" : "Start repeating again"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="amountKobo"
            label="Each month"
            error={failure?.field === "amountKobo" ? failure.message : undefined}
          >
            {(a11y) => <MoneyInput {...a11y} value={amount} onChange={setAmount} />}
          </Field>
          <Field
            id="dayOfMonth"
            label="On day"
            error={failure?.field === "dayOfMonth" ? failure.message : undefined}
            hint="The last day in shorter months"
          >
            {(a11y) => (
              <Input
                {...a11y}
                inputMode="numeric"
                className="num"
                maxLength={2}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value.replace(/\D/g, ""))}
              />
            )}
          </Field>
        </div>
        <p className="text-sm text-fg-muted">
          Each month&apos;s is made on its day, waiting for an owner to approve it, and owed until it&apos;s paid.
          Changes apply from the next one.
        </p>
      </div>
    </Sheet>
  );
}
