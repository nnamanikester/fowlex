"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Download,
  Landmark,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { EntrySheet } from "./entry-sheet";
import { FundSheet } from "./fund-sheet";
import { EmptyState, Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { apiRequest } from "@/lib/auth/client";
import { CATEGORY_LABELS, CHANNEL_LABELS } from "@/lib/balance/rules";
import type { BalanceSummary, EntryView, SyncResult } from "@/lib/balance/service";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatNaira } from "@/lib/money";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});
export const when = (iso: string) => WHEN.format(new Date(iso));

/**
 * The Paystack balance: what Paystack holds, what Fowlex's book says, whether they match, and every
 * movement with its reason. Opening the page checks with Paystack, so it's never stale.
 */
export function BalanceBoard({
  summary,
  entries,
  canSetTopUp,
  canAddTestMoney,
}: {
  summary: BalanceSummary;
  entries: EntryView[];
  canSetTopUp: boolean;
  canAddTestMoney: boolean;
}) {
  const router = useRouter();
  const check = useAction();
  const [funding, setFunding] = React.useState(false);
  const [open, setOpen] = React.useState<EntryView | null>(null);
  const [show, setShow] = React.useState<"all" | "credit" | "debit">("all");

  const sync = React.useCallback(
    (quiet = false) =>
      check.run(() => apiRequest<SyncResult & { summary: BalanceSummary }>("/api/balance/sync", "POST"), {
        key: "sync",
        toastError: !quiet,
        success: (r) =>
          r.fundedKobo.length
            ? `${formatNaira(r.fundedKobo.reduce((a, b) => a + b, 0))} arrived in the balance.`
            : quiet
              ? undefined
              : r.summary.differenceKobo === 0
                ? "Checked: Fowlex matches Paystack."
                : "Checked with Paystack.",
        onSuccess: () => router.refresh(),
      }),
    [check, router],
  );

  // Opening the page checks with Paystack once, quietly: the figures are as of now.
  const checked = React.useRef(false);
  React.useEffect(() => {
    if (checked.current || summary.mode === "off") return;
    checked.current = true;
    void sync(true);
  }, [summary.mode, sync]);

  if (summary.mode === "off")
    return (
      <Panel>
        <EmptyState
          icon={<Landmark />}
          title="Paystack isn't set up"
          description="Once the farm's Paystack secret key is added, Fowlex keeps a book of the balance here: every top-up, transfer and fee."
        />
      </Panel>
    );

  const shown = entries.filter((e) => show === "all" || e.direction === show);
  const matches = summary.differenceKobo === 0;

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="In Paystack"
          value={summary.paystackKobo === null ? "–" : formatNaira(summary.paystackKobo)}
          hint={summary.mode === "live" ? "Real money" : summary.mode === "test" ? "Paystack test money" : "Test money"}
        />
        <StatCard
          label="In Fowlex's book"
          value={formatNaira(summary.fowlexKobo)}
          hint={pendingHint(summary.pending)}
        />
        <div
          role="status"
          className={cn(
            "col-span-2 flex items-start gap-3 rounded-xl border p-4 lg:col-span-1",
            !summary.opened || summary.differenceKobo === null
              ? "border-line bg-surface"
              : matches
                ? "border-success-line bg-success-subtle"
                : "border-warning-line bg-warning-subtle",
          )}
        >
          {matches ? (
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success-fg" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-fg" aria-hidden />
          )}
          <div className="min-w-0 text-sm">
            <p className="font-bold text-fg">
              {!summary.opened
                ? "Starting the book…"
                : matches
                  ? "Matches Paystack"
                  : summary.differenceKobo === null
                    ? "Not checked yet"
                    : `${formatNaira(Math.abs(summary.differenceKobo))} ${summary.differenceKobo > 0 ? "more" : "less"} in Paystack`}
            </p>
            <p className="text-fg-muted">
              {check.isPending("sync")
                ? "Checking with Paystack…"
                : summary.syncedAt
                  ? `Checked ${when(summary.syncedAt)}`
                  : "Not checked yet"}
              {!matches &&
                summary.pending > 0 &&
                ". Transfers on their way settle the difference once Paystack lists them."}
            </p>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 grid grid-cols-2 gap-2 lg:static lg:flex lg:flex-wrap">
        <Button size="lg" className="shadow-pop lg:shadow-none" onClick={() => setFunding(true)}>
          <Plus /> Fund balance
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="shadow-pop lg:shadow-none"
          loading={check.isPending("sync")}
          onClick={() => void sync()}
        >
          <RefreshCw /> Check now
        </Button>
      </div>

      <Panel
        title="Every movement"
        description="Newest first. Tap one for who, how, and Paystack's reference."
        flush
        actions={
          <Button
            size="sm"
            variant="ghost"
            disabled={!entries.length}
            reason="Nothing to download yet."
            onClick={() => downloadCsv("paystack-balance.csv", entriesCsv(entries))}
          >
            <Download /> CSV
          </Button>
        }
      >
        <div className="px-5 pb-3">
          <Segmented
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: "all", label: "All" },
              { value: "credit", label: "Money in" },
              { value: "debit", label: "Money out" },
            ]}
          />
        </div>
        {shown.length === 0 ? (
          <EmptyState
            title={entries.length ? "Nothing here" : "No movements yet"}
            description={
              entries.length ? "Nothing matches this filter." : "Top-ups, transfers and fees show here as they happen."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpen(e)}
                  className="focus-ring flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-subtle"
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full",
                      e.direction === "credit" ? "bg-success-subtle text-success-fg" : "bg-surface-muted text-fg-muted",
                    )}
                    aria-hidden
                  >
                    {e.direction === "credit" ? (
                      <ArrowDownLeft className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate font-semibold text-fg">{e.description}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                      {CATEGORY_LABELS[e.category]} · {when(e.occurredAt)}
                      {!e.confirmed && <Badge tone="info">Waiting for Paystack</Badge>}
                    </span>
                  </span>
                  <span className="num flex shrink-0 flex-col items-end gap-1.5 text-right">
                    <span
                      className={cn("block font-semibold", e.direction === "credit" ? "text-success-fg" : "text-fg")}
                    >
                      {e.direction === "credit" ? "+" : "−"}
                      {formatNaira(e.amountKobo)}
                    </span>
                    <span className="block text-xs text-fg-muted">{formatNaira(e.balanceAfterKobo)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {funding && (
        <FundSheet
          summary={summary}
          canSetTopUp={canSetTopUp}
          canAddTestMoney={canAddTestMoney}
          onClose={() => setFunding(false)}
          onFunded={(kobo) => {
            toast.success(`${formatNaira(kobo)} arrived in the balance.`);
            setFunding(false);
            router.refresh();
          }}
          onSaved={() => router.refresh()}
        />
      )}
      {open && <EntrySheet entry={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const pendingHint = (n: number) =>
  n === 0 ? "Every movement confirmed" : n === 1 ? "1 waiting for Paystack" : `${n} waiting for Paystack`;

/** The whole book as a spreadsheet, for the accountant. */
function entriesCsv(entries: EntryView[]) {
  return toCsv(
    [
      "Date",
      "Description",
      "Category",
      "In or out",
      "Amount (₦)",
      "Balance after (₦)",
      "Confirmed by Paystack",
      "How",
      "Started by",
      "Account",
      "Paystack reference",
      "Paystack ledger id",
    ],
    entries.map((e) => [
      e.occurredAt,
      e.description,
      CATEGORY_LABELS[e.category],
      e.direction === "credit" ? "In" : "Out",
      (e.amountKobo / 100).toFixed(2),
      (e.balanceAfterKobo / 100).toFixed(2),
      e.confirmed ? "Yes" : "Not yet",
      CHANNEL_LABELS[e.channel],
      e.initiatedBy,
      e.counterparty ? `${e.counterparty.name} ${e.counterparty.bankName} ${e.counterparty.accountNumber}`.trim() : "",
      e.paystack.reference ?? e.paystack.transferCode ?? "",
      e.paystack.ledgerId ?? "",
    ]),
  );
}
