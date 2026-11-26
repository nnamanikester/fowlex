"use client";

import * as React from "react";

import { Section } from "./showcase";
import { BreakdownBar, ForecastChart, TrendChart, type ForecastRow, type TrendRow } from "@/components/charts";
import { DateRangePicker, FilterMenu, IdText, Panel } from "@/components/kit";
import { type Column, DataTable } from "@/components/tables/data-table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { FileDrop } from "@/components/ui/file-drop";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/ui/money-input";
import { type DateRange, presetRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { useToday } from "@/lib/use-today";

type Invoice = {
  number: string;
  customer: string;
  issued: string;
  totalKobo: number;
  status: "paid" | "part-paid" | "overdue" | "sent";
};

const CUSTOMERS = [
  "Chicken Republic, Lekki",
  "The Grill Lounge",
  "Bukka Hut, Ikeja",
  "Eko Hotel Kitchens",
  "Mama Cass, Surulere",
  "Sky Lounge VI",
];
const STATUSES: Invoice["status"][] = ["paid", "paid", "part-paid", "overdue", "sent"];

/** 26 sample invoices: enough to page through. */
const INVOICES: Invoice[] = Array.from({ length: 26 }, (_, i) => ({
  number: `INV-2026-${String(i + 1).padStart(4, "0")}`,
  customer: CUSTOMERS[(i * 5) % CUSTOMERS.length],
  issued: `2026-${String(10 + Math.floor(i / 14)).padStart(2, "0")}-${String((i % 14) * 2 + 1).padStart(2, "0")}`,
  totalKobo: (180_000 + ((i * 7919) % 900_000)) * 100,
  status: STATUSES[i % STATUSES.length],
}));

const STATUS: Record<Invoice["status"], { label: string; tone: BadgeTone }> = {
  paid: { label: "Paid", tone: "success" },
  "part-paid": { label: "Part-paid", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
  sent: { label: "Sent", tone: "info" },
};

const COLUMNS: Column<Invoice>[] = [
  {
    id: "number",
    header: "Invoice",
    cell: (r) => <IdText value={r.number} full />,
    sortValue: (r) => r.number,
    csv: (r) => r.number,
  },
  {
    id: "customer",
    header: "Customer",
    cell: (r) => <span className="font-medium">{r.customer}</span>,
    sortValue: (r) => r.customer,
    csv: (r) => r.customer,
  },
  {
    id: "issued",
    header: "Issued",
    cell: (r) => r.issued,
    sortValue: (r) => r.issued,
    csv: (r) => r.issued,
    hideBelow: "md",
  },
  {
    id: "status",
    header: "Status",
    cell: (r) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>,
    sortValue: (r) => r.status,
    csv: (r) => STATUS[r.status].label,
    hideBelow: "sm",
  },
  {
    id: "total",
    header: "Total",
    cell: (r) => formatNaira(r.totalKobo),
    sortValue: (r) => r.totalKobo,
    csv: (r) => r.totalKobo / 100,
    align: "right",
  },
];

const MONTHS = ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
const naira = (n: number) => n * 100;

/** Revenue and expenses by month, in kobo. */
const TREND: TrendRow[] = MONTHS.map((label, i) => ({
  label,
  revenue: naira(2_400_000 + i * 210_000 + (i % 3) * 180_000),
  expenses: naira(2_000_000 + i * 140_000 + ((i + 1) % 4) * 120_000),
}));

/** Six months of revenue, then six months forecast with a widening range. */
const FORECAST: ForecastRow[] = [
  ...["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map((label, i) => ({
    label,
    actual: naira(3_300_000 + i * 250_000 + (i % 2) * 150_000),
  })),
  ...["Dec", "Jan", "Feb", "Mar", "Apr", "May"].map((label, i) => {
    const forecast = naira(4_700_000 + (i + 1) * 240_000);
    const spread = naira(180_000 * (i + 1));
    return { label, forecast, low: forecast - spread, high: forecast + spread };
  }),
];
// The last actual month also starts the forecast, so the two lines meet.
FORECAST[5] = { ...FORECAST[5], forecast: FORECAST[5].actual, low: FORECAST[5].actual, high: FORECAST[5].actual };

/** Expenses by category this month, in a fixed category order. Eight categories: two fold into Other. */
const BREAKDOWN = [
  { label: "Feed", value: naira(2_310_000) },
  { label: "Chicks", value: naira(1_150_000) },
  { label: "Labour", value: naira(640_000) },
  { label: "Medication", value: naira(212_000) },
  { label: "Transport", value: naira(185_000) },
  { label: "Utilities", value: naira(96_000) },
  { label: "Equipment", value: naira(54_000) },
  { label: "Miscellaneous", value: naira(31_500) },
];

export function DataShowcase() {
  return (
    <div className="space-y-12">
      <Section id="tables" title="Tables and inputs">
        <InvoiceTable />
        <InputsDemo />
      </Section>
      <Section id="charts" title="Charts">
        <Panel title="Revenue and expenses" description="By month, last 12 months.">
          <TrendChart title="Revenue and expenses by month" data={TREND} series={SERIES} />
        </Panel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Revenue forecast" description="Six months back, six ahead.">
            <ForecastChart title="Revenue, actual and forecast by month" measure="Revenue" data={FORECAST} />
          </Panel>
          <Panel title="Live weight" description="One series: average kg per bird, B-2026-07.">
            <TrendChart
              title="Average live weight by week, batch B-2026-07"
              unit="count"
              data={[0.18, 0.47, 0.92, 1.45, 2.0, 2.42].map((kg, i) => ({ label: `Wk ${i + 1}`, weight: kg }))}
              series={[{ key: "weight", label: "Average kg" }]}
            />
          </Panel>
        </div>
        <Panel title="Expenses by category" description="November 2026.">
          <BreakdownBar title="Expenses by category, November 2026" parts={BREAKDOWN} />
        </Panel>
      </Section>
    </div>
  );
}

const SERIES = [
  { key: "revenue", label: "Revenue" },
  { key: "expenses", label: "Expenses" },
];

function InvoiceTable() {
  const [status, setStatus] = React.useState<"" | Invoice["status"]>("");
  const rows = status ? INVOICES.filter((r) => r.status === status) : INVOICES;
  return (
    <DataTable
      label="Invoices"
      rows={rows}
      columns={COLUMNS}
      getRowId={(r) => r.number}
      searchPlaceholder="Search invoices"
      pageSize={10}
      initialSort={{ id: "number", dir: "desc" }}
      csv={{ filename: "fowlex-invoices" }}
      toolbar={
        <FilterMenu
          label="Status"
          value={status}
          onChange={setStatus}
          options={(Object.keys(STATUS) as Invoice["status"][]).map((value) => ({ value, label: STATUS[value].label }))}
        />
      }
    />
  );
}

function InputsDemo() {
  const [amount, setAmount] = React.useState<number | null>(1_850_050);
  // This month, once the browser knows today (null while prerendering).
  const on = useToday();
  const [picked, setRange] = React.useState<DateRange | null>(null);
  const range = picked ?? (on ? presetRange("this-month", on) : null);
  const [files, setFiles] = React.useState<File[]>([]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="grid content-start gap-5">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-fg">Amount</span>
          <MoneyInput value={amount} onChange={setAmount} placeholder="0.00" />
          <span className="text-xs text-fg-subtle">
            Stored as <code className="text-fg">{amount === null ? "null" : `${amount} kobo`}</code>
          </span>
        </label>
        <div className="grid gap-1.5">
          <span className="text-sm font-semibold text-fg">Period</span>
          {range ? (
            <>
              <div>
                <DateRangePicker value={range} onChange={setRange} label="Period" />
              </div>
              <span className="text-xs text-fg-subtle">
                <code className="text-fg">
                  {range.from} → {range.to}
                </code>
              </span>
            </>
          ) : (
            <Skeleton className="h-9 w-44 rounded-xl" />
          )}
        </div>
      </div>
      <FileDrop files={files} onChange={setFiles} label="Attach a receipt" />
    </div>
  );
}
