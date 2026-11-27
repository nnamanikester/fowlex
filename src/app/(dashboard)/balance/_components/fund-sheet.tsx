"use client";

import * as React from "react";
import { CircleCheck, LoaderCircle, Pencil } from "lucide-react";

import { Field } from "@/components/auth";
import { CopyButton } from "@/components/kit";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/auth/client";
import { type TopUpAccount, validateTopUp } from "@/lib/balance/rules";
import type { BalanceSummary, SyncResult } from "@/lib/balance/service";
import { formatNaira } from "@/lib/money";
import { useAction } from "@/lib/use-action";

/** How often, and for how long, Fowlex looks for a top-up after "I've sent it". */
const WATCH_EVERY_MS = 10_000;
const WATCH_FOR_MS = 5 * 60_000;

/**
 * Funding the balance: the top-up account the Paystack Dashboard shows, to copy into a bank app,
 * then "I've sent it" watches Paystack until the money lands. Outside live, test money too.
 */
export function FundSheet({
  summary,
  canSetTopUp,
  canAddTestMoney,
  onClose,
  onFunded,
  onSaved,
}: {
  summary: BalanceSummary;
  canSetTopUp: boolean;
  canAddTestMoney: boolean;
  onClose: () => void;
  onFunded: (kobo: number) => void;
  onSaved: () => void;
}) {
  const [topUp, setTopUp] = React.useState<TopUpAccount | null>(summary.topUp);
  const [editing, setEditing] = React.useState(!summary.topUp && canSetTopUp);
  const [watching, setWatching] = React.useState<number | null>(null);
  const [gaveUp, setGaveUp] = React.useState(false);
  const action = useAction();
  const funded = React.useRef(onFunded);
  React.useEffect(() => {
    funded.current = onFunded;
  });

  // Watching for the top-up: check every 10 s, stop when it lands, after 5 minutes, or on close.
  React.useEffect(() => {
    if (watching === null) return;
    let live = true;
    const tick = async () => {
      const r = await apiRequest<SyncResult>("/api/balance/sync", "POST").catch(() => null);
      if (!live) return;
      const kobo = r?.fundedKobo.reduce((a, b) => a + b, 0) ?? 0;
      if (kobo > 0) {
        setWatching(null);
        funded.current(kobo);
      } else if (Date.now() - watching > WATCH_FOR_MS) {
        setWatching(null);
        setGaveUp(true);
      }
    };
    const timer = setInterval(() => void tick(), WATCH_EVERY_MS);
    void tick();
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [watching]);

  const busy = action.busy;
  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Fund the balance"
      subtitle={summary.paystackKobo === null ? undefined : `${formatNaira(summary.paystackKobo)} in Paystack now`}
      footer={
        editing ? undefined : (
          <div className="space-y-2">
            <ActionFeedback action={action} />
            {topUp && (
              <Button
                size="lg"
                fullWidth
                loading={watching !== null}
                onClick={() => {
                  setGaveUp(false);
                  setWatching(Date.now());
                }}
              >
                I&apos;ve sent it
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="space-y-6">
        {editing ? (
          <TopUpForm
            initial={topUp}
            onCancel={topUp ? () => setEditing(false) : undefined}
            onSaved={(saved) => {
              setTopUp(saved);
              setEditing(false);
              onSaved();
            }}
          />
        ) : topUp ? (
          <section className="space-y-3">
            <p className="text-sm text-fg-muted">
              Transfer any amount from your bank app to this account. Paystack adds it to the balance, usually within
              minutes, and Fowlex books it as funding.
            </p>
            <div className="space-y-3 rounded-xl border border-line bg-surface-subtle p-4">
              <div>
                <p className="text-xs font-semibold text-fg-muted">Bank</p>
                <p className="font-semibold text-fg">{topUp.bankName}</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-fg-muted">Account number</p>
                  <p className="num font-display text-2xl font-bold tracking-wider text-fg-heading">
                    {topUp.accountNumber}
                  </p>
                </div>
                <CopyButton value={topUp.accountNumber} label="Copy the account number" />
              </div>
              <div>
                <p className="text-xs font-semibold text-fg-muted">Account name</p>
                <p className="text-fg">{topUp.accountName}</p>
              </div>
            </div>
            {watching !== null && (
              <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Watching for your money. Keep this open, or
                close it: it&apos;s booked either way.
              </p>
            )}
            {gaveUp && (
              <p role="status" className="text-sm text-warning-fg">
                Nothing yet after 5 minutes. Bank transfers can take longer: Fowlex books it as soon as Paystack shows
                it, and emails the owners.
              </p>
            )}
            {canSetTopUp && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-brand-fg"
              >
                <Pencil className="size-3.5" aria-hidden /> Change the account
              </button>
            )}
          </section>
        ) : (
          <p className="rounded-xl border border-info-line bg-info-subtle px-3 py-2.5 text-sm text-fg">
            The top-up account isn&apos;t in Fowlex yet. Ask an owner to add it: it&apos;s on the Paystack Dashboard,
            under Balance, then Top up.
          </p>
        )}

        {summary.mode !== "live" && !editing && (
          <TestMoney mode={summary.mode} canAdd={canAddTestMoney} onAdded={onFunded} />
        )}
      </div>
    </Sheet>
  );
}

/** The top-up account, copied from the Paystack Dashboard once. */
function TopUpForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: TopUpAccount | null;
  onCancel?: () => void;
  onSaved: (topUp: TopUpAccount) => void;
}) {
  const [v, setV] = React.useState<TopUpAccount>(initial ?? { bankName: "", accountNumber: "", accountName: "" });
  const [submitted, setSubmitted] = React.useState(false);
  const action = useAction();
  const errors = validateTopUp(v);
  const show = (f: keyof TopUpAccount) => action.fieldError(f, submitted ? errors[f] : undefined);
  const set = (f: keyof TopUpAccount, value: string) => setV((d) => ({ ...d, [f]: value }));

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (Object.keys(errors).length) {
          document.getElementById(Object.keys(errors)[0])?.focus();
          return;
        }
        void action.run(() => apiRequest<TopUpAccount>("/api/balance/top-up", "PATCH", v), {
          success: "Top-up account saved.",
          onSuccess: onSaved,
        });
      }}
    >
      <p className="text-sm text-fg-muted">
        On the Paystack Dashboard, open <strong>Balance</strong>, then <strong>Top up</strong>: it shows the account to
        transfer to. Enter it here once, and anyone funding the balance sees it in Fowlex.
      </p>
      <Field id="bankName" label="Bank" error={show("bankName")}>
        {(a11y) => (
          <Input
            {...a11y}
            value={v.bankName}
            placeholder="Wema Bank"
            onChange={(e) => set("bankName", e.target.value)}
          />
        )}
      </Field>
      <Field id="accountNumber" label="Account number" error={show("accountNumber")}>
        {(a11y) => (
          <Input
            {...a11y}
            inputMode="numeric"
            className="num tracking-wider"
            maxLength={10}
            value={v.accountNumber}
            placeholder="0123456789"
            onChange={(e) => set("accountNumber", e.target.value.replace(/\D/g, "").slice(0, 10))}
          />
        )}
      </Field>
      <Field id="accountName" label="Account name" error={show("accountName")}>
        {(a11y) => (
          <Input
            {...a11y}
            value={v.accountName}
            placeholder="Paystack / Fowlex Farms"
            onChange={(e) => set("accountName", e.target.value)}
          />
        )}
      </Field>
      <ActionFeedback action={action} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="submit" size="lg" loading={action.busy}>
          <CircleCheck /> Save the account
        </Button>
        {onCancel && (
          <Button variant="ghost" size="lg" disabled={action.busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** Play money: added straight away in the simulator; from Paystack's test Dashboard with test keys. */
function TestMoney({
  mode,
  canAdd,
  onAdded,
}: {
  mode: BalanceSummary["mode"];
  canAdd: boolean;
  onAdded: (kobo: number) => void;
}) {
  const [amount, setAmount] = React.useState<number | null>(5_000_000);
  const action = useAction();
  return (
    <section className="space-y-3 rounded-xl border border-dashed border-line-strong p-4">
      <h3 className="font-semibold text-fg">Test money</h3>
      {mode === "test" ? (
        <p className="text-sm text-fg-muted">
          These are Paystack test keys. Top up from the Paystack Dashboard in test mode (Balance, then Top up) with a
          test card, then tap <strong>Check now</strong>: Fowlex books it as funding.
        </p>
      ) : canAdd ? (
        <>
          <p className="text-sm text-fg-muted">Nothing here is real money. Add some to try paying from Fowlex.</p>
          <Field id="testAmount" label="Amount" error={action.fieldError("amountKobo")}>
            {(a11y) => <MoneyInput {...a11y} value={amount} onChange={setAmount} placeholder="50,000.00" />}
          </Field>
          <ActionFeedback action={action} />
          <Button
            variant="secondary"
            fullWidth
            loading={action.busy}
            disabled={!amount}
            reason="Enter how much to add."
            onClick={() =>
              void action.run(() => apiRequest<SyncResult>("/api/balance/test-money", "POST", { amountKobo: amount }), {
                onSuccess: () => onAdded(amount ?? 0),
              })
            }
          >
            Add {amount ? formatNaira(amount) : "test money"}
          </Button>
        </>
      ) : (
        <p className="text-sm text-fg-muted">An owner can add test money here.</p>
      )}
    </section>
  );
}
