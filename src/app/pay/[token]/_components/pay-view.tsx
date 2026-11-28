"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleCheck, CreditCard, FileDown, Landmark, LockKeyhole, Phone } from "lucide-react";

import { TransferAccount } from "@/components/payments/transfer-account";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth/client";
import type { CollectionView, PayPage } from "@/lib/collections/service";
import { formatRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

/** Whole naira when there are no kobo. */
const naira = (kobo: number) => (kobo % 100 ? formatNaira(kobo) : formatNaira(kobo).replace(/\.00$/, ""));
const day = (d: string) => formatRange({ from: d, to: d });

/**
 * The page a customer opens from their invoice: who it's from, what's owed, and two ways to pay
 * (Paystack's checkout for card, bank app or USSD; or a bank account made for the bill). Paid,
 * it's a receipt.
 */
export function PayView({
  data,
  returned,
  simulated,
}: {
  data: PayPage;
  /** Back from checkout: whether the money came in (null when they didn't come from there). */
  returned: boolean | null;
  simulated: boolean;
}) {
  const router = useRouter();
  const action = useAction();
  const [account, setAccount] = React.useState<CollectionView | null>(data.account);
  const [lines, setLines] = React.useState(false);
  const paid = data.balanceKobo === 0 && data.state !== "void";
  const base = `/api/public/pay/${data.token}`;

  const checkout = () =>
    void action.run(() => apiRequest<{ url: string }>(`${base}/checkout`, "POST"), {
      key: "card",
      onSuccess: ({ url }) => window.location.assign(url),
    });
  const transfer = () =>
    void action.run(() => apiRequest<CollectionView>(`${base}/transfer`, "POST"), {
      key: "transfer",
      onSuccess: setAccount,
    });

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="bg-charcoal text-white">
        <div className="mx-auto max-w-xl px-4 pb-24 pt-6">
          <div className="flex items-center justify-between gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- an SVG logo, already the right size */}
            <img src="/brand/fowlex-logo-horizontal-reverse.svg" alt="" className="h-6 w-auto" />
            <span className="text-sm text-white/70">{data.farm.name}</span>
          </div>
          <p className="mt-10 text-white/70">
            {data.customerName
              ? `${data.customerName}, your bill from ${data.farm.name}`
              : `Your bill from ${data.farm.name}`}
          </p>
          <p className="mt-1 font-mono text-sm text-white/60">{data.number}</p>
        </div>
      </header>

      <main className="mx-auto -mt-16 max-w-xl space-y-5 px-4 pb-16">
        <section className="space-y-5 rounded-3xl bg-surface p-6 shadow-pop sm:p-8">
          {data.state === "void" ? (
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-bold text-fg-heading">This bill was cancelled</h1>
              <p className="text-fg-muted">
                There&apos;s nothing to pay on it. Ask {data.farm.name} if you&apos;re unsure.
              </p>
            </div>
          ) : paid ? (
            <div role="status" className="space-y-3 text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-success text-white motion-safe:animate-pop-in">
                <CircleCheck className="size-9" aria-hidden />
              </span>
              <h1 className="font-display text-3xl font-bold text-fg-heading">Paid. Thank you</h1>
              <p className="text-fg-muted">
                <span className="num font-semibold text-fg">{naira(data.totalKobo)}</span> for {data.number} is paid in
                full{data.lastPaid ? `, the last of it on ${day(data.lastPaid.at.slice(0, 10))}` : ""}.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-fg-muted">To pay</p>
              <h1 className="num font-display text-5xl font-bold leading-none tracking-tight text-fg-heading">
                {naira(data.balanceKobo)}
              </h1>
              <p className="text-sm text-fg-muted">
                Due {day(data.dueDate)}
                {data.paidKobo > 0 && ` · ${naira(data.paidKobo)} of ${naira(data.totalKobo)} already paid`}
              </p>
            </div>
          )}

          {returned === false && !paid && (
            <p
              role="alert"
              className="rounded-xl border border-warning-line bg-warning-subtle px-4 py-3 text-sm text-fg"
            >
              The payment didn&apos;t go through, so nothing was taken. Try again, or pay by transfer.
            </p>
          )}

          <div className="border-t border-line pt-4">
            <button
              type="button"
              aria-expanded={lines}
              onClick={() => setLines((l) => !l)}
              className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg text-left text-sm font-semibold text-fg"
            >
              What it&apos;s for
              <ChevronDown className={cn("size-4 transition-transform", lines && "rotate-180")} aria-hidden />
            </button>
            {lines && (
              <ul className="mt-3 space-y-2.5">
                {data.lines.map((l) => (
                  <li key={l.description} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="min-w-0 text-fg">{l.description}</span>
                    <span className="num shrink-0 text-fg">{naira(l.amountKobo)}</span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5 text-sm font-semibold">
                  <span>Total</span>
                  <span className="num">{naira(data.totalKobo)}</span>
                </li>
              </ul>
            )}
            <a
              href={`${base}/pdf`}
              className="focus-ring mt-3 inline-flex items-center gap-2 rounded text-sm font-semibold text-brand-fg hover:underline"
            >
              <FileDown className="size-4" aria-hidden /> Download the invoice
            </a>
          </div>
        </section>

        {!paid && data.state !== "void" && (
          <section aria-label="How to pay" className="space-y-3">
            <h2 className="px-1 font-semibold text-fg-heading">How would you like to pay?</h2>
            <div className="space-y-3 rounded-3xl bg-surface p-5 shadow-card sm:p-6">
              <div className="flex items-start gap-4">
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-subtle text-brand-fg"
                  aria-hidden
                >
                  <CreditCard className="size-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-fg-heading">Card, bank app or USSD</p>
                  <p className="text-sm text-fg-muted">
                    On Paystack&apos;s secure page. You come back here when it&apos;s done.
                  </p>
                </div>
              </div>
              <Button size="lg" fullWidth loading={action.isPending("card")} disabled={action.busy} onClick={checkout}>
                Pay {naira(data.balanceKobo)}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-fg-muted">
                <LockKeyhole className="size-3.5" aria-hidden /> Secured by Paystack
              </p>
            </div>

            <div className="space-y-4 rounded-3xl bg-surface p-5 shadow-card sm:p-6">
              <div className="flex items-start gap-4">
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-subtle text-fg-muted"
                  aria-hidden
                >
                  <Landmark className="size-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-fg-heading">Bank transfer</p>
                  <p className="text-sm text-fg-muted">
                    An account number for this bill only. It shows Paid here by itself.
                  </p>
                </div>
              </div>
              {account ? (
                <TransferAccount
                  collection={account}
                  checkUrl={(id) => `${base}/collections/${id}`}
                  simulated={simulated}
                  onPaid={() => router.refresh()}
                  onNew={transfer}
                />
              ) : (
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  loading={action.isPending("transfer")}
                  disabled={action.busy}
                  onClick={transfer}
                >
                  Get an account number
                </Button>
              )}
            </div>
            <ActionFeedback action={action} />
          </section>
        )}

        {(data.farm.phone || data.farm.email) && (
          <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-fg-muted">
            Questions about this bill?
            {data.farm.phone && (
              <a
                href={`tel:${data.farm.phone.replace(/\s/g, "")}`}
                className="focus-ring inline-flex items-center gap-1 rounded font-semibold text-brand-fg"
              >
                <Phone className="size-3.5" aria-hidden /> {data.farm.phone}
              </a>
            )}
          </p>
        )}
      </main>
    </div>
  );
}
