"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, FileText, LoaderCircle, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field, FormAlert } from "@/components/auth";
import { ConfirmDialog } from "@/components/kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest, asProblem } from "@/lib/auth/client";
import { useAction } from "@/lib/use-action";
import { formatRange } from "@/lib/dates";
import { lineTotal, PAY_METHOD_LABELS, PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/expenses/rules";
import { type CategoryView, categoryName } from "@/lib/expenses/categories";
import type { ExpenseView } from "@/lib/expenses/service";
import type { ItemView } from "@/lib/inventory/items";
import { quantity } from "@/lib/inventory/rules";
import { formatNaira } from "@/lib/money";
import type { PayoutView } from "@/lib/payouts/service";
import type { SupplierView } from "@/lib/suppliers/service";

export const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = {
  unpaid: "warning",
  paying: "info",
  otp: "warning",
  paid: "success",
  failed: "danger",
};
const day = (d: string) => formatRange({ from: d, to: d });
type Preview = {
  amountKobo: number;
  recipient: { accountName: string; bankName: string; accountNumber: string };
  balanceKobo: number;
  enough: boolean;
  feeKobo: number;
};

/**
 * One expense: what it was, who it's for, how it's paid, and its Paystack transfers. Owners pay
 * from here: a preview of who gets the money and the balance, then one confirmed tap. `startPay`
 * opens straight on that step (right after recording an expense to pay now).
 */
export function ExpenseSheet({
  expense,
  categories,
  suppliers,
  items,
  batches,
  canWrite,
  canPay,
  startPay = false,
  canApprove = false,
  onClose,
}: {
  canApprove?: boolean;
  expense: ExpenseView;
  categories: CategoryView[];
  suppliers: SupplierView[];
  items: ItemView[];
  batches: { id: string; code: string }[];
  canWrite: boolean;
  canPay: boolean;
  startPay?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = React.useState(expense);
  const [payouts, setPayouts] = React.useState<PayoutView[]>([]);
  const [paying, setPaying] = React.useState(startPay);
  const [marking, setMarking] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [notes, setNotes] = React.useState(expense.notes);
  const [historyProblem, setHistoryProblem] = React.useState<string | null>(null);
  const action = useAction();
  const supplier = suppliers.find((s) => s.id === current.supplierId);
  const byId = new Map(items.map((i) => [i.id, i]));
  const batch = batches.find((b) => b.id === current.batchId);

  // After a payment: the latest transfers and the expense as it now stands. If that can't load, the
  // payment still happened: say the screen may be behind rather than hiding it.
  const refresh = React.useCallback(async () => {
    try {
      const [list, fresh] = await Promise.all([
        apiRequest<PayoutView[]>(`/api/expenses/${expense.id}/payouts`, "GET"),
        apiRequest<ExpenseView[]>(`/api/expenses`, "GET").then((all) => all.find((e) => e.id === expense.id)),
      ]);
      setPayouts(list);
      setHistoryProblem(null);
      if (fresh) setCurrent(fresh);
    } catch (e) {
      setHistoryProblem(asProblem(e).message);
    }
    router.refresh();
  }, [expense.id, router]);

  const [historyAttempt, setHistoryAttempt] = React.useState(0);
  React.useEffect(() => {
    let live = true;
    apiRequest<PayoutView[]>(`/api/expenses/${expense.id}/payouts`, "GET").then(
      (list) => {
        if (!live) return;
        setPayouts(list);
        setHistoryProblem(null);
      },
      (e: AuthError) => live && setHistoryProblem(e.message),
    );
    return () => {
      live = false;
    };
  }, [expense.id, historyAttempt]);

  // Waiting for approval: it can be approved, rejected or paid in cash, but not sent through Paystack.
  const approved = current.approval === "approved";
  const owed =
    current.approval !== "rejected" && (current.paymentStatus === "unpaid" || current.paymentStatus === "failed");
  const decide = (path: "approve" | "reject", body?: unknown) =>
    action.run(() => apiRequest<ExpenseView>(`/api/expenses/${current.id}/${path}`, "POST", body), {
      key: path,
      success: path === "approve" ? `${current.number} approved.` : `${current.number} rejected.`,
      onSuccess: (saved) => {
        setCurrent(saved);
        setRejecting(false);
        router.refresh();
      },
    });
  const latest = payouts[0];

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={current.description || categoryName(categories, current.category)}
        subtitle={`${current.number} · ${day(current.date)}`}
        footer={
          paying && canPay && owed ? undefined : (
            <div className="space-y-2">
              <ActionFeedback action={action} />
              {canApprove && current.approval === "pending" && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="lg"
                    loading={action.isPending("approve")}
                    disabled={action.busy}
                    onClick={() => void decide("approve")}
                  >
                    <CircleCheck /> Approve
                  </Button>
                  <Button size="lg" variant="secondary" disabled={action.busy} onClick={() => setRejecting(true)}>
                    Reject
                  </Button>
                </div>
              )}
              {canPay && owed && approved && (supplier?.bank || current.payeeBank) && (
                <Button size="lg" fullWidth onClick={() => setPaying(true)}>
                  <Send /> Pay {formatNaira(current.amountKobo)} with Paystack
                </Button>
              )}
              {canWrite && owed && (
                <Button
                  variant={
                    (canPay && approved && (supplier?.bank || current.payeeBank)) || (canApprove && !approved)
                      ? "secondary"
                      : "primary"
                  }
                  size="lg"
                  fullWidth
                  onClick={() => setMarking(true)}
                >
                  <CircleCheck /> Paid outside Fowlex
                </Button>
              )}
              {canWrite && !current.automatic && notes !== current.notes && (
                <Button
                  variant="secondary"
                  fullWidth
                  loading={action.isPending("notes")}
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(
                      () =>
                        apiRequest<ExpenseView>(`/api/expenses/${current.id}`, "PATCH", {
                          notes,
                          version: current.version,
                        }),
                      {
                        key: "notes",
                        success: "Notes saved.",
                        onSuccess: (saved) => {
                          setCurrent(saved);
                          router.refresh();
                        },
                      },
                    )
                  }
                >
                  Save notes
                </Button>
              )}
              {canWrite && !current.automatic && current.method !== "paystack" && (
                <Button variant="ghost" className="text-danger-fg" fullWidth onClick={() => setDeleting(true)}>
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
          )
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-3xl font-bold text-fg-heading">{formatNaira(current.amountKobo)}</span>
            <Badge tone={PAYMENT_TONE[current.paymentStatus]} dot>
              {PAYMENT_STATUS_LABELS[current.paymentStatus]}
            </Badge>
          </div>

          {paying && canPay && owed ? (
            <PayStep
              expense={current}
              onCancel={() => setPaying(false)}
              onDone={async () => {
                setPaying(false);
                await refresh();
              }}
            />
          ) : (
            <>
              {current.approval === "pending" && (
                <p className="rounded-xl border border-info-line bg-info-subtle px-3 py-2.5 text-sm text-fg">
                  Above the approval limit: it doesn&apos;t count until an owner approves it
                  {canPay ? ", and can't be sent through Paystack before then." : "."}
                </p>
              )}
              {current.approval === "rejected" && (
                <p className="rounded-xl border border-danger-line bg-danger-subtle px-3 py-2.5 text-sm text-fg">
                  <strong>Rejected:</strong> {current.approvalNote} It doesn&apos;t count and isn&apos;t owed; record it
                  again to put it right.
                </p>
              )}
              {historyProblem && (
                <FormAlert title="The transfers for this expense didn't load.">
                  <p>
                    {historyProblem}{" "}
                    <button
                      type="button"
                      className="focus-ring rounded font-bold text-fg underline"
                      onClick={() => setHistoryAttempt((a) => a + 1)}
                    >
                      Try again
                    </button>
                  </p>
                </FormAlert>
              )}
              {latest && <TransferStatus payout={latest} canPay={canPay} onChange={refresh} />}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact label="For" value={categoryName(categories, current.category)} />
                <Fact label="Paid to" value={supplier?.name ?? (current.payeeName || "–")} />
                <Fact
                  label="Paid by"
                  value={current.paymentStatus === "paid" ? PAY_METHOD_LABELS[current.method] : "Not yet"}
                />
                <Fact label="Paid on" value={current.paidOn ? day(current.paidOn) : "–"} />
                <Fact label="Batch" value={batch?.code ?? "The whole farm"} />
                <Fact label="Recorded" value={day(current.createdAt.slice(0, 10))} />
              </dl>

              {current.lines.length > 0 && (
                <div className="rounded-xl border border-line">
                  <ul className="divide-y divide-line text-sm">
                    {current.lines.map((l, i) => {
                      const item = byId.get(l.itemId);
                      return (
                        <li key={i} className="num flex justify-between gap-3 px-4 py-2.5">
                          <span className="text-fg">
                            {item ? `${quantity(l.quantity, item.unit)} ${item.name}` : "An item no longer in stock"}
                            <span className="block text-xs text-fg-muted">at {formatNaira(l.unitCostKobo)} each</span>
                          </span>
                          <span className="font-semibold text-fg">{formatNaira(lineTotal(l))}</span>
                        </li>
                      );
                    })}
                    {current.deliveryKobo > 0 && (
                      <li className="num flex justify-between px-4 py-2.5">
                        <span className="text-fg-muted">Delivery</span>
                        <span className="text-fg">{formatNaira(current.deliveryKobo)}</span>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {current.receipt ? (
                <a
                  href={current.receipt.url}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-brand-fg"
                >
                  <FileText className="size-4" aria-hidden /> View receipt
                </a>
              ) : (
                <p className="text-sm text-fg-subtle">No receipt</p>
              )}

              {canWrite && !current.automatic ? (
                <Field id="expense-notes" label="Notes">
                  {(a11y) => (
                    <Textarea
                      {...a11y}
                      rows={2}
                      maxLength={500}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  )}
                </Field>
              ) : (
                current.notes && <p className="text-sm text-fg-muted">{current.notes}</p>
              )}

              {payouts.length > 1 && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-fg">Earlier transfers</summary>
                  <ul className="mt-2 space-y-1 text-fg-muted">
                    {payouts.slice(1).map((p) => (
                      <li key={p.id}>
                        {day(p.createdAt.slice(0, 10))}: {p.status} {p.failure && `(${p.failure})`}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      </Sheet>

      {marking && (
        <MarkPaidSheet
          expense={current}
          onClose={() => setMarking(false)}
          onSaved={(saved) => {
            setMarking(false);
            setCurrent(saved);
            toast.success(`${saved.number} marked paid.`);
            router.refresh();
          }}
        />
      )}
      {rejecting && (
        <RejectSheet
          expense={current}
          onClose={() => setRejecting(false)}
          action={action}
          onReject={(reason) => decide("reject", { reason })}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${current.number}?`}
        description={
          current.lines.length
            ? "The stock it brought in comes off again. It stays in the audit log."
            : "It stays in the audit log."
        }
        confirmLabel="Delete expense"
        onConfirm={async () => {
          await apiRequest(`/api/expenses/${current.id}`, "DELETE");
          toast.success(`${current.number} deleted.`);
          router.refresh();
          onClose();
        }}
      />
    </>
  );
}

/** Who gets the money, the balance, and one confirmed tap to send it. */
function PayStep({ expense, onCancel, onDone }: { expense: ExpenseView; onCancel: () => void; onDone: () => void }) {
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [problem, setProblem] = React.useState<AuthError | null>(null);
  const [sending, setSending] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    apiRequest<Preview>(`/api/expenses/${expense.id}/pay`, "GET").then(
      (p) => live && setPreview(p),
      (e: AuthError) => live && setProblem(e),
    );
    return () => {
      live = false;
    };
  }, [expense.id]);

  const send = async () => {
    setSending(true);
    setProblem(null);
    try {
      const payout = await apiRequest<PayoutView>(`/api/expenses/${expense.id}/pay`, "POST");
      if (payout.status === "success")
        toast.success(`${formatNaira(payout.amountKobo)} sent to ${payout.recipient.accountName}.`);
      else if (payout.status === "otp") toast.message("Paystack sent an OTP. Enter it to release the transfer.");
      else if (payout.status === "failed") toast.error(payout.failure);
      else toast.message("The transfer is on its way. It updates when the bank confirms.");
      onDone();
    } catch (e) {
      setProblem(e as AuthError);
    } finally {
      setSending(false);
    }
  };

  if (problem && !preview)
    return (
      <div className="space-y-3">
        <FormAlert title={problem.message} />
        <Button variant="secondary" fullWidth onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  if (!preview)
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Checking the account and your Paystack balance…
      </p>
    );
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface-subtle p-4">
        <p className="text-sm text-fg-muted">Sending to</p>
        <p className="text-lg font-bold text-fg-heading">{preview.recipient.accountName}</p>
        <p className="text-sm text-fg-muted">
          {preview.recipient.bankName} {preview.recipient.accountNumber}
        </p>
      </div>
      <dl className="num grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-fg-muted">Amount</dt>
        <dd className="text-right font-semibold text-fg">{formatNaira(preview.amountKobo)}</dd>
        <dt className="text-fg-muted">Paystack fee</dt>
        <dd className="text-right text-fg">{formatNaira(preview.feeKobo)}</dd>
        <dt className="text-fg-muted">Paystack balance</dt>
        <dd className={preview.enough ? "text-right text-fg" : "text-right font-semibold text-danger-fg"}>
          {formatNaira(preview.balanceKobo)}
        </dd>
      </dl>
      {!preview.enough && (
        <FormAlert title="Your Paystack balance doesn't cover this.">
          <p>Top up the balance on Paystack, then pay. It stays owed until then.</p>
        </FormAlert>
      )}
      {problem && <FormAlert title={problem.message} />}
      <label className="flex items-start gap-3 text-sm text-fg">
        <input
          type="checkbox"
          className="mt-0.5 size-5 accent-[rgb(var(--brand))]"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I&apos;ve checked <strong>{preview.recipient.accountName}</strong> is who I mean to pay. A transfer can&apos;t
          be taken back.
        </span>
      </label>
      <div className="grid gap-2">
        <Button
          size="lg"
          fullWidth
          loading={sending}
          disabled={!confirmed || !preview.enough}
          reason={
            !preview.enough
              ? "Your Paystack balance doesn't cover this. Top it up first."
              : "Tick the box to say you've checked who you're paying."
          }
          onClick={() => void send()}
        >
          <Send /> Send {formatNaira(preview.amountKobo)}
        </Button>
        <Button variant="ghost" fullWidth disabled={sending} onClick={onCancel}>
          Not now
        </Button>
      </div>
    </div>
  );
}

/** Where the latest transfer stands, with an OTP box or a check button when it needs one. */
function TransferStatus({
  payout,
  canPay,
  onChange,
}: {
  payout: PayoutView;
  canPay: boolean;
  onChange: () => Promise<void>;
}) {
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<AuthError | null>(null);
  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setProblem(null);
    try {
      const after = await apiRequest<PayoutView>(path, "POST", body);
      if (after?.status === "success")
        toast.success(`${formatNaira(after.amountKobo)} sent to ${after.recipient.accountName}.`);
      await onChange();
    } catch (e) {
      setProblem(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  const to = `${payout.recipient.accountName}, ${payout.recipient.bankName} ${payout.recipient.accountNumber}`;
  if (payout.status === "success")
    return (
      <p className="flex items-start gap-2 rounded-xl border border-success-line bg-success-subtle px-3 py-2.5 text-sm text-fg">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden />
        <span>
          Sent to {to}. Paystack&apos;s fee: {formatNaira(payout.feeKobo)}.
        </span>
      </p>
    );
  if (payout.status === "failed" || payout.status === "reversed")
    return (
      <p className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-subtle px-3 py-2.5 text-sm text-fg">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger-fg" aria-hidden />
        <span>
          {payout.failure || "The transfer didn't go through."} {canPay && "You can pay again."}
        </span>
      </p>
    );
  return (
    <div className="space-y-3 rounded-xl border border-info-line bg-info-subtle p-3 text-sm">
      <p className="flex items-start gap-2 text-fg">
        <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-info-fg" aria-hidden />
        <span>
          {payout.status === "otp"
            ? `Paystack sent an OTP to release ${formatNaira(payout.amountKobo)} to ${to}.`
            : `${formatNaira(payout.amountKobo)} is on its way to ${to}. It updates when the bank confirms.`}
        </span>
      </p>
      {problem && <FormAlert title={problem.message} />}
      {canPay && payout.status === "otp" && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act(`/api/payouts/${payout.id}/otp`, { otp });
          }}
        >
          <Field id="otp" label="OTP">
            {(a11y) => (
              <Input
                {...a11y}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="num tracking-widest"
                maxLength={8}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              />
            )}
          </Field>
          <Button
            type="submit"
            loading={busy}
            disabled={otp.length < 4}
            reason="Type the OTP Paystack sent first."
            className="mb-0.5"
          >
            Send
          </Button>
        </form>
      )}
      {canPay && payout.status === "pending" && (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() => void act(`/api/payouts/${payout.id}/check`)}
        >
          <RefreshCw /> Check with Paystack
        </Button>
      )}
    </div>
  );
}

function MarkPaidSheet({
  expense,
  onClose,
  onSaved,
}: {
  expense: ExpenseView;
  onClose: () => void;
  onSaved: (expense: ExpenseView) => void;
}) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  const [method, setMethod] = React.useState<"cash" | "transfer" | "pos">("cash");
  const [paidOn, setPaidOn] = React.useState(today);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<AuthError | null>(null);
  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Paid outside Fowlex"
      subtitle={`${expense.number} · ${formatNaira(expense.amountKobo)}`}
      footer={
        <Button
          size="lg"
          fullWidth
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setProblem(null);
            try {
              onSaved(await apiRequest<ExpenseView>(`/api/expenses/${expense.id}/paid`, "POST", { method, paidOn }));
            } catch (e) {
              setProblem(e as AuthError);
            } finally {
              setBusy(false);
            }
          }}
        >
          Mark as paid
        </Button>
      }
    >
      <div className="space-y-5">
        {problem && <FormAlert title={problem.message} />}
        <Segmented
          label="Paid by"
          className="w-full"
          value={method}
          onChange={setMethod}
          options={[
            { value: "cash", label: "Cash" },
            { value: "transfer", label: "Transfer" },
            { value: "pos", label: "POS" },
          ]}
        />
        <Field id="paidOn" label="Paid on">
          {(a11y) => (
            <Input
              {...a11y}
              type="date"
              value={paidOn}
              min={expense.date}
              max={today}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-fg-muted">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}

/** Rejecting needs a reason, so the person who spent it can put it right. */
function RejectSheet({
  expense,
  onClose,
  onReject,
  action,
}: {
  expense: ExpenseView;
  onClose: () => void;
  onReject: (reason: string) => Promise<unknown>;
  action: { failure: AuthError | null; slow: boolean; busy: boolean };
}) {
  const [reason, setReason] = React.useState("");
  const busy = action.busy;
  const [tried, setTried] = React.useState(false);
  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title={`Reject ${expense.number}?`}
      subtitle={formatNaira(expense.amountKobo)}
      footer={
        <div className="space-y-2">
          <ActionFeedback action={action} />
          <Button
            size="lg"
            variant="danger"
            fullWidth
            loading={busy}
            onClick={() => {
              setTried(true);
              if (reason.trim()) void onReject(reason);
            }}
          >
            Reject
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">
          It won&apos;t count or be owed{expense.lines.length ? ", and the stock it brought in comes off" : ""}.
        </p>
        <Field
          id="reason"
          label="Why"
          error={tried && !reason.trim() ? "Say why, so they can put it right." : undefined}
        >
          {(a11y) => (
            <Textarea
              {...a11y}
              rows={3}
              maxLength={300}
              placeholder="The price was ₦17,000 a bag, not ₦19,000."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Sheet>
  );
}
