// Safe for the browser: a report is plain data, the page and the exports read it the same way.

export const REPORTS = ["profit", "cashflow", "expenses", "sales", "aging", "payroll"] as const;
export type ReportKind = (typeof REPORTS)[number];
export const REPORT_LABELS: Record<ReportKind, string> = {
  profit: "Profit and loss",
  cashflow: "Cash flow",
  expenses: "Expenses by category",
  sales: "Sales by customer",
  aging: "Who owes what",
  payroll: "Payroll summary",
};
export const PROFIT_BY = ["month", "quarter", "batch"] as const;
export type ProfitBy = (typeof PROFIT_BY)[number];

/** What a column holds, so every export shows it right: money in naira, dates Excel reads. */
export type ColumnKind = "text" | "date" | "month" | "money" | "number" | "percent";
export type ReportColumn = { header: string; kind: ColumnKind };
/** Money in kobo, dates as YYYY-MM-DD, months as YYYY-MM, percent as a number (12.5). */
export type Cell = string | number | null;

export type ReportTable = {
  kind: string;
  title: string;
  /** What it covers: "2026", "All batches", "As of 28 Nov 2026". */
  period: string;
  columns: ReportColumn[];
  rows: Cell[][];
  /** The totals row, when adding up makes sense. */
  total: Cell[] | null;
  /** Without the extension. */
  filename: string;
  /** A line under the table: how it was worked out. */
  note?: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A month for people: "2026-11" → "Nov 2026". */
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** A cell as a person reads it, with money in `money` (formatNaira on screen, NGN in a PDF). */
export function showCell(value: Cell, kind: ColumnKind, money: (kobo: number) => string) {
  if (value === null || value === "") return "–";
  if (typeof value === "string") {
    // A label in a date column ("Total") stays as it is.
    if (kind === "month" && /^\d{4}-\d{2}$/.test(value)) return monthLabel(value);
    if (kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-");
      return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
    }
    return value;
  }
  if (kind === "money") return money(value);
  if (kind === "percent") return `${value.toLocaleString("en-NG")}%`;
  return value.toLocaleString("en-NG");
}

/**
 * A cell for a spreadsheet: money as a plain naira number (Excel adds it up and formats it),
 * percent as a number, dates as ISO text Excel reads as a date.
 */
export function csvCell(value: Cell, kind: ColumnKind): string | number | null {
  if (value === null) return null;
  if (typeof value === "number") return kind === "money" ? Math.round(value) / 100 : value;
  return value;
}

/** The CSV header: money columns say they're in naira. */
export const csvHeader = (c: ReportColumn) =>
  c.kind === "money" ? `${c.header} (NGN)` : c.kind === "percent" ? `${c.header} (%)` : c.header;
