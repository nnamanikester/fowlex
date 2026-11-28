"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download } from "lucide-react";

import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { buttonClasses } from "@/components/ui/button-classes";
import type { Basis } from "@/lib/finance/pnl";
import { type ProfitBy, REPORT_LABELS, REPORTS, type ReportKind } from "@/lib/reports/table";

type State = { report: ReportKind; by: ProfitBy; basis: Basis; year: number };

/** Which report, its options, and its downloads. Every choice is in the address, so it can be shared. */
export function ReportControls({ state, years }: { state: State; years: number[] }) {
  const router = useRouter();
  const path = usePathname();
  const [, start] = React.useTransition();
  const query = (s: State) =>
    new URLSearchParams({ report: s.report, by: s.by, basis: s.basis, year: String(s.year) }).toString();
  const go = (next: Partial<State>) =>
    start(() => router.replace(`${path}?${query({ ...state, ...next })}`, { scroll: false }));
  const file = (format: "csv" | "pdf") => `/api/reports/${state.report}?${query(state)}&format=${format}`;
  const profit = state.report === "profit";
  const hasYear = state.report !== "aging" && !(profit && state.by === "batch");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        aria-label="Report"
        className="w-full sm:w-56"
        value={state.report}
        onChange={(e) => go({ report: e.target.value as ReportKind })}
      >
        {REPORTS.map((k) => (
          <option key={k} value={k}>
            {REPORT_LABELS[k]}
          </option>
        ))}
      </Select>
      {profit && (
        <>
          <Segmented
            label="Profit by"
            value={state.by}
            onChange={(by) => go({ by })}
            options={[
              { value: "month", label: "By month" },
              { value: "quarter", label: "By quarter" },
              { value: "batch", label: "By batch" },
            ]}
          />
          <Segmented
            label="Count income"
            value={state.basis}
            onChange={(basis) => go({ basis })}
            options={[
              { value: "accrual", label: "Invoiced" },
              { value: "cash", label: "Cash received" },
            ]}
          />
        </>
      )}
      {hasYear && (
        <Select
          aria-label="Year"
          className="w-28"
          value={String(state.year)}
          onChange={(e) => go({ year: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      )}
      <div className="flex gap-2 sm:ml-auto">
        <a
          href={file("csv")}
          download
          aria-label="Download CSV"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          <Download /> CSV
        </a>
        <a
          href={file("pdf")}
          download
          aria-label="Download PDF"
          className={buttonClasses({ variant: "secondary", size: "sm" })}
        >
          <Download /> PDF
        </a>
      </div>
    </div>
  );
}
