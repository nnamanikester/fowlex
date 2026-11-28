"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { StatCard } from "@/components/kit";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import type { Basis, BatchPnl, MonthPnl, Pnl } from "@/lib/finance/pnl";
import { formatNaira } from "@/lib/money";

export type View = "months" | "batches";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
const naira = (kobo: number) => Math.round(kobo) / 100;
/** Profit as a share of income; far past 999% (costs, and next to no income) it says so instead. */
export const margin = (p: Pick<Pnl, "marginPct">) =>
  p.marginPct === null
    ? "–"
    : p.marginPct <= -1000
      ? "< −999%"
      : p.marginPct >= 1000
        ? "> 999%"
        : `${p.marginPct.toLocaleString("en-NG")}%`;

const WHOLE = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

/**
 * A headline amount, sized to fit a card on a phone: whole naira below ₦1m (₦900,000), rounded
 * above (₦10.1M). The exact figure is on hover, and in the table and CSV.
 */
export function Figure({ kobo }: { kobo: number }) {
  const short =
    Math.abs(kobo) < 100_000_000 ? WHOLE.format(Math.round(kobo / 100)) : formatNaira(kobo, { compact: true });
  return <span title={formatNaira(kobo)}>{short}</span>;
}

/** Profit or Loss, always in words. Nothing earned or spent yet shows nothing. */
export function Verdict({ p }: { p: Pick<Pnl, "profitKobo" | "incomeKobo" | "costKobo"> }) {
  if (!p.incomeKobo && !p.costKobo) return null;
  return p.profitKobo >= 0 ? <Badge tone="success">Profit</Badge> : <Badge tone="danger">Loss</Badge>;
}

/** The same money columns on every profit table. */
function moneyColumns<T extends Pnl>(): Column<T>[] {
  return [
    {
      id: "income",
      header: "Income",
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => formatNaira(r.incomeKobo),
      sortValue: (r) => r.incomeKobo,
      csv: (r) => naira(r.incomeKobo),
    },
    {
      id: "direct",
      header: "Direct costs",
      align: "right",
      className: "whitespace-nowrap",
      hideBelow: "md",
      cell: (r) => formatNaira(r.directKobo),
      sortValue: (r) => r.directKobo,
      csv: (r) => naira(r.directKobo),
    },
    {
      id: "shared",
      header: "Shared costs",
      align: "right",
      className: "whitespace-nowrap",
      hideBelow: "lg",
      cell: (r) => formatNaira(r.sharedKobo),
      sortValue: (r) => r.sharedKobo,
      csv: (r) => naira(r.sharedKobo),
    },
    {
      id: "profit",
      header: "Net profit",
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => <span className={r.profitKobo < 0 ? "text-danger-fg" : undefined}>{formatNaira(r.profitKobo)}</span>,
      sortValue: (r) => r.profitKobo,
      csv: (r) => naira(r.profitKobo),
    },
    {
      id: "margin",
      header: "Margin",
      align: "right",
      className: "whitespace-nowrap",
      hideBelow: "sm",
      cell: margin,
      sortValue: (r) => r.marginPct,
      csv: (r) => r.marginPct,
    },
  ];
}

/** Profit and loss, by month or by batch, invoiced or as cash came in. */
export function ReportsBoard({
  view,
  basis,
  year,
  years,
  total,
  months,
  batches,
}: {
  view: View;
  basis: Basis;
  year: number;
  years: number[];
  total: Pnl;
  months: MonthPnl[];
  batches: BatchPnl[];
}) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = React.useTransition();
  const go = (next: Partial<{ view: View; basis: Basis; year: number }>) => {
    const q = new URLSearchParams({
      view,
      basis,
      year: String(year),
      ...Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])),
    });
    start(() => router.replace(`${path}?${q}`, { scroll: false }));
  };

  const monthColumns: Column<MonthPnl>[] = [
    { id: "month", header: "Month", cell: (r) => monthName(r.month), sortValue: (r) => r.month, csv: (r) => r.month },
    ...moneyColumns<MonthPnl>(),
    { id: "verdict", header: "", cell: (r) => <Verdict p={r} /> },
  ];
  const batchColumns: Column<BatchPnl>[] = [
    {
      id: "batch",
      header: "Batch",
      cell: (r) => (
        <Link
          href={`/batches/${r.batchId}`}
          className="font-mono font-medium whitespace-nowrap text-fg hover:underline"
        >
          {r.code}
        </Link>
      ),
      sortValue: (r) => r.placedOn,
      csv: (r) => r.code,
    },
    ...moneyColumns<BatchPnl>(),
    {
      id: "perBird",
      header: "Cost a bird",
      align: "right",
      className: "whitespace-nowrap",
      hideBelow: "lg",
      cell: (r) => (r.perBirdKobo === null ? "–" : formatNaira(r.perBirdKobo)),
      sortValue: (r) => r.perBirdKobo,
      csv: (r) => (r.perBirdKobo === null ? null : naira(r.perBirdKobo)),
    },
    {
      id: "perKg",
      header: "Cost a kg",
      align: "right",
      className: "whitespace-nowrap",
      hideBelow: "lg",
      cell: (r) => (r.perKgKobo === null ? "–" : formatNaira(r.perKgKobo)),
      sortValue: (r) => r.perKgKobo,
      csv: (r) => (r.perKgKobo === null ? null : naira(r.perKgKobo)),
    },
    { id: "verdict", header: "", cell: (r) => <Verdict p={r} /> },
  ];

  const scope = view === "months" ? String(year) : "All batches";
  return (
    <div className="space-y-4" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Report"
          value={view}
          onChange={(v) => go({ view: v })}
          options={[
            { value: "months", label: "By month" },
            { value: "batches", label: "By batch" },
          ]}
        />
        <Segmented
          label="Count income"
          value={basis}
          onChange={(v) => go({ basis: v })}
          options={[
            { value: "accrual", label: "Invoiced" },
            { value: "cash", label: "Cash received" },
          ]}
        />
        {view === "months" && (
          <Select
            aria-label="Year"
            className="w-28"
            value={String(year)}
            onChange={(e) => go({ year: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Income"
          value={<Figure kobo={total.incomeKobo} />}
          hint={basis === "accrual" ? `Invoiced, ${scope}` : `Received, ${scope}`}
        />
        <StatCard label="Costs" value={<Figure kobo={total.costKobo} />} hint="Direct and shared" />
        <StatCard
          label={
            <span className="inline-flex items-center gap-2">
              Net profit <Verdict p={total} />
            </span>
          }
          value={<Figure kobo={total.profitKobo} />}
          hint={scope}
        />
        <StatCard label="Margin" value={margin(total)} hint="Profit as a share of income" />
      </div>

      {view === "months" ? (
        <DataTable
          label={`Profit and loss by month, ${year}`}
          rows={months}
          columns={monthColumns}
          getRowId={(r) => r.month}
          search={false}
          pageSize={12}
          initialSort={{ id: "month", dir: "asc" }}
          csv={{ filename: `fowlex-profit-${year}-${basis}` }}
          empty={<p className="px-5 py-8 text-center text-sm text-fg-muted">Nothing earned or spent in {year} yet.</p>}
        />
      ) : (
        <DataTable
          label="Profit and loss by batch"
          rows={batches}
          columns={batchColumns}
          getRowId={(r) => r.batchId}
          searchPlaceholder="Search batches"
          csv={{ filename: `fowlex-profit-by-batch-${basis}` }}
          empty={<p className="px-5 py-8 text-center text-sm text-fg-muted">No batches yet.</p>}
        />
      )}
      <p className="text-xs text-fg-muted">
        Direct costs are what each batch used: chicks, feed and drugs at average cost, labour and its expenses. Shared
        costs (rent, power, salaried staff, equipment wear) are shared out by bird-days. Income is net of VAT.
      </p>
    </div>
  );
}
