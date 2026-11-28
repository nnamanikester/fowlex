"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, FileDown, RotateCcw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { STATE_TONE } from "./payroll-board";
import { ExpenseSheet } from "../../expenses/_components/expense-sheet";
import { Field, FormAlert } from "@/components/auth";
import { Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Sheet } from "@/components/ui/sheet";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { type AuthError, apiRequest, asProblem } from "@/lib/auth/client";
import type { CategoryView } from "@/lib/expenses/categories";
import type { ExpenseView } from "@/lib/expenses/service";
import type { ItemView } from "@/lib/inventory/items";
import { formatNaira } from "@/lib/money";
import { monthName } from "@/lib/people/advance-rules";
import { type Adjustment, PAY_STATE_LABELS, validateAdjustment } from "@/lib/payroll/rules";
import type { RunLine, RunView } from "@/lib/payroll/service";
import type { SupplierView } from "@/lib/suppliers/service";

const PAID_LABEL: Record<string, string> = {
  unpaid: "To pay",
  paying: "On its way",
  otp: "Waiting for OTP",
  paid: "Paid",
  failed: "Failed: try again",
};

/** A month's pay: everyone's pay and how it was worked out; adjust, approve, then pay. */
export function RunDetail({
  run,
  payslips,
  context,
  canAdjust,
  canApprove,
  canPay,
  canMarkPaid,
}: {
  run: RunView;
  payslips: ExpenseView[];
  context: {
    suppliers: SupplierView[];
    items: ItemView[];
    categories: CategoryView[];
    batches: { id: string; code: string }[];
  };
  canAdjust: boolean;
  canApprove: boolean;
  canPay: boolean;
  canMarkPaid: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const [adjusting, setAdjusting] = React.useState<RunLine | null>(null);
  const [paying, setPaying] = React.useState<ExpenseView | null>(null);
  const draft = run.status === "draft";
  const month = monthName(run.period);
  const toSend = run.lines.filter(
    (l) => l.hasBank && l.expense && ["unpaid", "failed"].includes(l.expense.paymentStatus),
  );
  const anyPaid = run.lines.some(
    (l) => l.expense && l.expense.paymentStatus !== "unpaid" && l.expense.paymentStatus !== "failed",
  );

  const act = async (key: string, fn: () => Promise<unknown>, message?: (r: unknown) => string) => {
    setBusy(key);
    setFailure(null);
    try {
      const result = await fn();
      if (message) toast.success(message(result));
      router.refresh();
      return result;
    } catch (e) {
      // The buttons float at the bottom on a phone, far from the alert at the top: say it there too.
      const problem = asProblem(e);
      setFailure(problem);
      toast.error(problem.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <Link
        href="/payroll"
        className="focus-ring inline-flex items-center gap-1 rounded-md text-sm font-medium text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-4" aria-hidden /> Payroll
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-fg-heading">{month} pay</h1>
        <Badge tone={STATE_TONE[run.payState]}>{PAY_STATE_LABELS[run.payState]}</Badge>
      </div>
      {draft && (
        <p className="text-sm text-fg-muted">
          Worked out from salaries, attendance, closed batches and advances, and kept up to date until it&apos;s
          approved. Tap someone to add a bonus or a deduction.
        </p>
      )}
      {failure && <FormAlert title={failure.message} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="To pay"
          value={formatNaira(run.totals.netKobo)}
          hint={run.totals.people === 1 ? "1 person" : `${run.totals.people} people`}
        />
        <StatCard
          label="Pay earned"
          value={formatNaira(run.totals.grossKobo + run.totals.bonusKobo)}
          hint={run.totals.bonusKobo ? `with ${formatNaira(run.totals.bonusKobo)} in bonuses` : "before deductions"}
        />
        <StatCard label="Advances taken back" value={formatNaira(run.totals.advanceKobo)} hint="already given" />
        <StatCard label="Other deductions" value={formatNaira(run.totals.deductionKobo)} hint="this month" />
      </div>

      <Panel flush>
        <ul className="divide-y divide-line">
          {run.lines.map((l) => {
            const payslip = payslips.find((e) => e.id === l.expense?.id);
            const open = draft
              ? canAdjust
                ? () => setAdjusting(l)
                : undefined
              : payslip
                ? () => setPaying(payslip)
                : undefined;
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{l.name}</span>
                    {l.excluded && <Badge>Not paid this month</Badge>}
                    {!draft && l.expense && (
                      <Badge
                        tone={
                          l.expense.paymentStatus === "paid"
                            ? "success"
                            : l.expense.paymentStatus === "failed"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {PAID_LABEL[l.expense.paymentStatus]}
                      </Badge>
                    )}
                  </span>
                  <span className="block text-xs text-fg-muted">{l.basis}</span>
                  {(l.bonusKobo > 0 || l.deductionKobo > 0 || l.advanceKobo > 0) && (
                    <span className="num block text-xs text-fg-muted">
                      {[
                        l.bonusKobo > 0 && `+ ${formatNaira(l.bonusKobo)} bonus`,
                        l.advanceKobo > 0 && `− ${formatNaira(l.advanceKobo)} advance`,
                        l.deductionKobo > 0 && `− ${formatNaira(l.deductionKobo)} ${l.deductionNote}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {!l.hasBank && !l.excluded && l.netKobo > 0 && (
                    <span className="block text-xs text-warning-fg">No bank account: pay in cash</span>
                  )}
                </span>
                <span className="num shrink-0 text-right font-semibold text-fg">
                  {l.excluded ? "—" : formatNaira(l.netKobo)}
                </span>
                {open && <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />}
              </>
            );
            return (
              <li key={l.id} className="flex items-stretch">
                {open ? (
                  <button
                    type="button"
                    onClick={open}
                    className="focus-ring flex min-w-0 flex-1 items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-subtle"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex flex-1 items-center gap-3 px-5 py-3.5">{body}</div>
                )}
                {!draft && l.expense && (
                  <a
                    href={`/api/payroll/${run.id}/payslips?line=${l.id}`}
                    download
                    aria-label={`${l.name}'s payslip`}
                    className="focus-ring flex w-12 shrink-0 items-center justify-center border-l border-line text-fg-muted hover:bg-surface-subtle hover:text-fg"
                  >
                    <FileDown className="size-5" aria-hidden />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 space-y-2 lg:static lg:flex lg:flex-wrap lg:gap-2 lg:space-y-0">
        {draft && canApprove && (
          <Button
            size="lg"
            fullWidth
            className="shadow-pop lg:w-auto lg:shadow-none"
            loading={busy === "approve"}
            disabled={run.totals.netKobo === 0 && run.totals.advanceKobo === 0}
            reason="Nobody has any pay this month, so there's nothing to approve."
            onClick={() =>
              void act(
                "approve",
                () => apiRequest(`/api/payroll/${run.id}/approve`, "POST", { version: run.version }),
                () => `${month} pay approved: ${formatNaira(run.totals.netKobo)} to pay.`,
              )
            }
          >
            <CheckCircle2 /> Approve {formatNaira(run.totals.netKobo)}
          </Button>
        )}
        {!draft && canPay && toSend.length > 0 && (
          <Button
            size="lg"
            fullWidth
            className="shadow-pop lg:w-auto lg:shadow-none"
            loading={busy === "pay"}
            onClick={() =>
              void act(
                "pay",
                () =>
                  apiRequest<{ results: { name: string; status: string; message?: string }[] }>(
                    `/api/payroll/${run.id}/pay`,
                    "POST",
                  ),
                (r) => {
                  const { results } = r as { results: { name: string; status: string; message?: string }[] };
                  const sent = results.filter((x) => x.status === "sent").length;
                  const otp = results.filter((x) => x.status === "otp").length;
                  const failed = results.filter((x) => x.status === "failed");
                  for (const f of failed) toast.error(`${f.name}: ${f.message ?? "Paystack refused it."}`);
                  return [
                    sent && `${sent === 1 ? "1 payment" : `${sent} payments`} sent.`,
                    otp && `${otp} waiting for the OTP: tap each to enter it.`,
                    !sent && !otp && "Nothing was sent.",
                  ]
                    .filter(Boolean)
                    .join(" ");
                },
              )
            }
          >
            <Send /> Pay everyone through Paystack ({formatNaira(toSend.reduce((n, l) => n + l.netKobo, 0))})
          </Button>
        )}
      </div>
      {draft && !canApprove && (
        <p className="text-sm text-fg-muted">An owner approves the pay before anyone is paid.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!draft && (
          <a href={`/api/payroll/${run.id}/payslips`} download className={buttonClasses({ variant: "secondary" })}>
            <FileDown /> All payslips (PDF)
          </a>
        )}
        {!draft && canApprove && !anyPaid && (
          <Button
            variant="ghost"
            loading={busy === "reopen"}
            onClick={() =>
              void act(
                "reopen",
                () => apiRequest(`/api/payroll/${run.id}/reopen`, "POST"),
                () => `${month} pay is open to change again.`,
              )
            }
          >
            <RotateCcw /> Reopen to change it
          </Button>
        )}
        {draft && canAdjust && (
          <Button
            variant="ghost"
            loading={busy === "delete"}
            onClick={async () => {
              const done = await act(
                "delete",
                () => apiRequest(`/api/payroll/${run.id}`, "DELETE"),
                () => `${month} pay removed.`,
              );
              if (done !== undefined) router.push("/payroll");
            }}
          >
            <Trash2 /> Remove
          </Button>
        )}
      </div>

      {adjusting && (
        <AdjustSheet
          key={adjusting.id}
          line={adjusting}
          run={run}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            router.refresh();
          }}
        />
      )}
      {paying && (
        <ExpenseSheet
          expense={paying}
          categories={context.categories}
          suppliers={context.suppliers}
          items={context.items}
          batches={context.batches}
          canWrite={canMarkPaid}
          canPay={canPay}
          onClose={() => {
            setPaying(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AdjustSheet({
  line,
  run,
  onClose,
  onSaved,
}: {
  line: RunLine;
  run: RunView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = React.useState<Adjustment>({
    bonusKobo: line.bonusKobo,
    deductionKobo: line.deductionKobo,
    deductionNote: line.deductionNote,
    excluded: line.excluded,
  });
  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const errors = validateAdjustment(v);
  const show = (f: keyof Adjustment) => (failure?.field === f ? failure.message : submitted ? errors[f] : undefined);
  const net = Math.max(0, line.grossKobo + v.bonusKobo - v.deductionKobo - line.advanceKobo);

  const save = async () => {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setFailure(null);
    try {
      await apiRequest(`/api/payroll/${run.id}/lines/${line.employeeId}`, "PATCH", { ...v, version: run.version });
      toast.success(`${line.name}'s pay saved.`);
      onSaved();
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
      title={line.name}
      subtitle={line.basis}
      footer={
        <div className="space-y-2">
          <ActionFeedback action={{ failure }} />
          <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <dl className="num space-y-1.5 rounded-xl bg-surface-subtle p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Pay earned</dt>
            <dd>{formatNaira(line.grossKobo)}</dd>
          </div>
          {line.advanceKobo > 0 && (
            <div className="flex justify-between">
              <dt className="text-fg-muted">Advance taken back</dt>
              <dd>− {formatNaira(line.advanceKobo)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
            <dt>To pay</dt>
            <dd>{v.excluded ? "Nothing this month" : formatNaira(net)}</dd>
          </div>
        </dl>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-fg">Pay {line.name} this month</span>
          <ToggleSwitch
            checked={!v.excluded}
            onChange={(on) => setV((d) => ({ ...d, excluded: !on }))}
            ariaLabel={`Pay ${line.name} this month`}
          />
        </div>
        {!v.excluded && (
          <>
            <Field id="bonusKobo" label="Bonus" error={show("bonusKobo")} hint="Optional">
              {(a11y) => (
                <MoneyInput
                  {...a11y}
                  value={v.bonusKobo || null}
                  onChange={(k) => setV((d) => ({ ...d, bonusKobo: k ?? 0 }))}
                  placeholder="0.00"
                />
              )}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="deductionKobo" label="Deduction" error={show("deductionKobo")} hint="Optional">
                {(a11y) => (
                  <MoneyInput
                    {...a11y}
                    value={v.deductionKobo || null}
                    onChange={(k) => setV((d) => ({ ...d, deductionKobo: k ?? 0 }))}
                    placeholder="0.00"
                  />
                )}
              </Field>
              <Field id="deductionNote" label="What for" error={show("deductionNote")}>
                {(a11y) => (
                  <Input
                    {...a11y}
                    value={v.deductionNote}
                    maxLength={120}
                    placeholder="Broken feeder"
                    onChange={(e) => setV((d) => ({ ...d, deductionNote: e.target.value }))}
                  />
                )}
              </Field>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
