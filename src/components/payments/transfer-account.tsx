"use client";

import * as React from "react";
import { Check, Copy, FlaskConical, RotateCw, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth/client";
import type { CollectionView } from "@/lib/collections/service";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

/** How often the screen asks whether the money has landed. */
const EVERY_MS = 4000;
/** How long an account works (ACCOUNT_MINUTES on the server), for the "time left" bar. */
const WORKS_MS = 60 * 60_000;

/** 9900000002 → "990 000 0002": read out in threes, the way bank apps print it. */
const spaced = (n: string) => n.replace(/^(\d{3})(\d{3})(\d+)$/, "$1 $2 $3");
/** Whole naira when there are no kobo: ₦14,000 reads faster than ₦14,000.00. */
const naira = (kobo: number) => (kobo % 100 ? formatNaira(kobo) : formatNaira(kobo).replace(/\.00$/, ""));

/**
 * A bank account to pay one bill into, laid out like a transfer slip to read across a counter: the
 * amount on top, then the bank, the account number (tap it to copy) and the name. It watches for
 * the money and turns into "Paid" by itself. `checkUrl` is where to ask; `onNew` gets a fresh
 * account when this one runs out.
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
  const [copied, setCopied] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const paidOnce = React.useRef(onPaid);
  React.useEffect(() => {
    paidOnce.current = onPaid;
  });
  // A new account from "Get a new account" replaces the one shown.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows the account passed in
    setC(initial);
  }, [initial]);

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

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await navigator.clipboard?.writeText(c.accountNumber).catch(() => undefined);
    setCopied(true);
  };
  const details = `Pay ${naira(c.amountKobo)} by transfer to ${c.bankName}, account ${c.accountNumber}${
    c.accountName ? ` (${c.accountName})` : ""
  }. It's for ${c.invoiceNumber} only.`;
  const share = async () => {
    if (navigator.share)
      await navigator.share({ title: `Pay ${c.invoiceNumber}`, text: details }).catch(() => undefined);
    else window.open(`https://wa.me/?text=${encodeURIComponent(details)}`, "_blank", "noopener");
  };

  if (c.status === "paid")
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-2 rounded-xl border border-success-line bg-success-subtle px-5 py-8 text-center motion-safe:animate-pop-in"
      >
        <span className="grid size-12 place-items-center rounded-full bg-success text-white">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={40}
              className="motion-safe:animate-draw"
            />
          </svg>
        </span>
        <p className="text-lg font-bold text-fg-heading">Paid</p>
        <p className="num text-sm text-fg">
          <strong>{naira(c.amountKobo)}</strong> came in for{" "}
          <span className="whitespace-nowrap">{c.invoiceNumber}.</span>
        </p>
      </div>
    );

  const leftMs = Math.max(0, Date.parse(c.expiresAt) - now);
  const minutes = Math.ceil(leftMs / 60_000);
  const expired = c.status === "expired" || leftMs === 0;

  return (
    <div className="space-y-4">
      <div className={cn("rounded-xl border border-line bg-surface shadow-card", expired && "opacity-60")}>
        <div className="space-y-1 border-b border-line px-5 py-4">
          <p className="text-sm text-fg-muted">Transfer exactly</p>
          <p className="num text-3xl font-extrabold tracking-tight text-fg-heading">{naira(c.amountKobo)}</p>
          <p className="text-xs text-fg-subtle">For {c.invoiceNumber}, and nothing else</p>
        </div>
        <dl className="divide-y divide-line">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <dt className="text-sm text-fg-muted">Bank</dt>
            <dd className="text-sm font-semibold text-fg">{c.bankName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <dt className="text-sm text-fg-muted">Account number</dt>
            <dd className="flex items-center gap-1">
              <span className="font-mono text-lg font-semibold tracking-wide text-fg-heading">
                {spaced(c.accountNumber)}
              </span>
              <button
                type="button"
                onClick={() => void copy()}
                disabled={expired}
                aria-label={copied ? "Copied" : "Copy the account number"}
                className="focus-ring inline-flex size-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-subtle hover:text-fg disabled:opacity-40"
              >
                {copied ? (
                  <Check className="size-4 text-success-fg" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
              </button>
            </dd>
          </div>
          {c.accountName && (
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-sm text-fg-muted">Account name</dt>
              <dd className="min-w-0 truncate text-sm font-semibold text-fg">{c.accountName}</dd>
            </div>
          )}
        </dl>
      </div>
      <span className="sr-only" role="status">
        {copied ? "Account number copied" : ""}
      </span>

      {expired ? (
        <div className="space-y-3 rounded-xl border border-warning-line bg-warning-subtle p-4">
          <p className="font-semibold text-fg-heading">This account has stopped working</p>
          <p className="text-sm text-fg-muted">
            Money sent to it now goes back to whoever sent it. Get a new account and give them that one.
          </p>
          {onNew && (
            <Button onClick={onNew} fullWidth>
              <RotateCw /> Get a new account
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3 rounded-xl bg-surface-subtle p-4">
            <div className="flex items-center gap-3">
              <span className="relative flex size-3 shrink-0" aria-hidden>
                <span className="absolute inset-0 rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
                <span className="relative size-3 rounded-full bg-brand" />
              </span>
              <p role="status" className="min-w-0 flex-1 font-semibold text-fg-heading">
                Waiting for the money
              </p>
              <p className="num shrink-0 text-sm text-fg-muted">{minutes} min left</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-out"
                style={{ width: `${Math.min(100, (leftMs / WORKS_MS) * 100)}%` }}
              />
            </div>
            <p className="text-sm text-fg-muted">
              They send exactly {naira(c.amountKobo)} from their bank app. This turns to <strong>Paid</strong> by
              itself, usually within a minute.
            </p>
          </div>
          <div className={cn("grid gap-2", simulated && "sm:grid-cols-2")}>
            <Button variant="secondary" onClick={() => void share()}>
              <Share2 /> Send them the details
            </Button>
            {simulated && (
              <button
                type="button"
                disabled={paying}
                onClick={() => {
                  setPaying(true);
                  void apiRequest("/api/dev/paystack/pay", "POST", { reference: c.reference }).finally(() =>
                    setPaying(false),
                  );
                }}
                className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-warning-line bg-warning-subtle px-4 text-sm font-semibold text-warning-fg disabled:opacity-60 [&_svg]:size-4"
              >
                <FlaskConical aria-hidden /> They&apos;ve paid (test money)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
