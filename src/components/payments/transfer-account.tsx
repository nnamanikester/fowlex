"use client";

import * as React from "react";
import { CircleCheck, Clock, LoaderCircle, RotateCw } from "lucide-react";

import { CopyButton } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth/client";
import type { CollectionView } from "@/lib/collections/service";
import { formatNaira } from "@/lib/money";

/** How often the screen asks whether the money has landed. */
const EVERY_MS = 4000;

const spaced = (n: string) => n.replace(/(\d{3})(\d{3})(\d+)/, "$1 $2 $3");

/**
 * A bank account to pay one bill into, shown big enough to read across a counter: the amount, the
 * bank, the number (with copy), how long it works. It watches for the money and turns into
 * "Paid" by itself. `checkUrl` is where to ask; `onNew` gets a fresh account when this one runs out.
 */
export function TransferAccount({
  collection: initial,
  checkUrl,
  onPaid,
  onNew,
  simulated = false,
}: {
  collection: CollectionView;
  checkUrl: (id: string) => string;
  onPaid?: (c: CollectionView) => void;
  onNew?: () => void;
  /** Paystack is simulated: offer a button that pays it, to try the flow. */
  simulated?: boolean;
}) {
  const [c, setC] = React.useState(initial);
  const [now, setNow] = React.useState(() => Date.now());
  const paidOnce = React.useRef(onPaid);
  React.useEffect(() => {
    paidOnce.current = onPaid;
  });

  React.useEffect(() => {
    if (c.status !== "waiting") return;
    let live = true;
    const tick = async () => {
      setNow(Date.now());
      const fresh = await apiRequest<CollectionView>(checkUrl(c.id), "GET").catch(() => null);
      if (!live || !fresh) return;
      setC(fresh);
    };
    const timer = setInterval(() => void tick(), EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [c.id, c.status, checkUrl]);

  // "Paid" stays on screen a moment, so whoever is watching sees it, before moving on.
  React.useEffect(() => {
    if (c.status !== "paid") return;
    const timer = setTimeout(() => paidOnce.current?.(c), 1500);
    return () => clearTimeout(timer);
  }, [c]);

  if (c.status === "paid")
    return (
      <div role="status" className="space-y-2 rounded-2xl border border-success-line bg-success-subtle p-6 text-center">
        <CircleCheck className="mx-auto size-12 text-success-fg" aria-hidden />
        <p className="font-display text-2xl font-bold text-fg-heading">Paid</p>
        <p className="num text-fg">
          {formatNaira(c.amountKobo)} received for {c.invoiceNumber}.
        </p>
      </div>
    );

  const minutes = Math.max(0, Math.round((Date.parse(c.expiresAt) - now) / 60_000));
  const expired = c.status === "expired" || minutes === 0;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-charcoal p-5 text-white">
        <p className="text-sm text-white/70">Transfer exactly</p>
        <p className="num font-display text-4xl font-bold">{formatNaira(c.amountKobo)}</p>
        <p className="mt-4 text-sm text-white/70">to {c.bankName}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="num font-display text-[clamp(1.75rem,9vw,2.5rem)] font-bold tracking-wider">
            {spaced(c.accountNumber)}
          </p>
          <CopyButton
            value={c.accountNumber}
            label="Copy the account number"
            className="text-white hover:bg-white/10"
          />
        </div>
        <p className="text-sm text-white/70">{c.accountName}</p>
      </div>
      {expired ? (
        <div className="space-y-2 rounded-2xl border border-warning-line bg-warning-subtle p-4 text-sm text-fg">
          <p className="font-semibold">This account has stopped working.</p>
          <p className="text-fg-muted">Money sent to it now goes back to the sender. Get a new account to pay into.</p>
          {onNew && (
            <Button size="sm" onClick={onNew}>
              <RotateCw /> Get a new account
            </Button>
          )}
        </div>
      ) : (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
          <LoaderCircle className="size-5 shrink-0 animate-spin text-brand" aria-hidden />
          <span className="min-w-0 flex-1 text-fg">
            Waiting for the money. This turns to <strong>Paid</strong> by itself when it lands.
          </span>
          <span className="flex shrink-0 items-center gap-1 text-fg-muted">
            <Clock className="size-4" aria-hidden /> {minutes} min
          </span>
        </div>
      )}
      {simulated && !expired && (
        <Button
          variant="secondary"
          fullWidth
          onClick={() => void apiRequest("/api/dev/paystack/pay", "POST", { reference: c.reference })}
        >
          They&apos;ve paid (test money)
        </Button>
      )}
    </div>
  );
}
