import { Suspense } from "react";
import type { Metadata } from "next";

import { ReportControls } from "./_components/report-controls";
import { ReportsBoard } from "./_components/reports-board";
import { ReportView } from "./_components/report-view";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { addPnl, batchesPnl, yearPnl } from "@/lib/finance/pnl";
import { requestToday } from "@/lib/page-data";
import { buildReport, readOptions, REPORTS, type ReportKind } from "@/lib/reports/build";
import { BatchModel } from "@/models/batch";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <RequirePermission permission="finance.read">
      <PageHeader
        title="Reports"
        description="Profit and loss, cash flow, spending, sales, who owes what and payroll. Each one downloads as a spreadsheet or a PDF."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Reports({ searchParams }: Pick<PageProps<"/reports">, "searchParams">) {
  const raw = await searchParams;
  const params = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  // Links from before there were several reports.
  if (params.get("view") === "batches" && !params.has("by")) params.set("by", "batch");
  const user = await requireUser();
  const today = await requestToday();
  const report: ReportKind = REPORTS.includes(params.get("report") as ReportKind)
    ? (params.get("report") as ReportKind)
    : "profit";
  const options = readOptions(params, today);
  const thisYear = Number(today.slice(0, 4));
  const first = await BatchModel.findOne({ farmId: user.farmId }, { placedOn: 1 }).sort({ placedOn: 1 }).lean();
  const firstYear = Math.min(thisYear, first ? Number(first.placedOn.slice(0, 4)) : thisYear);
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i);
  const year = years.includes(options.year) ? options.year : thisYear;
  const controls = <ReportControls state={{ report, by: options.by, basis: options.basis, year }} years={years} />;

  let body: React.ReactNode;
  if (report === "profit" && options.by === "batch") {
    const batches = await batchesPnl(user.farmId, options.basis, today);
    body = (
      <ReportsBoard
        by="batch"
        basis={options.basis}
        year={year}
        total={addPnl(batches)}
        months={[]}
        batches={batches}
      />
    );
  } else if (report === "profit" && options.by === "month") {
    const pnl = await yearPnl(user.farmId, year, options.basis, today);
    body = <ReportsBoard by="month" basis={options.basis} year={year} total={pnl} months={pnl.months} batches={[]} />;
  } else {
    body = <ReportView table={await buildReport(user.farmId, report, { ...options, year })} />;
  }
  return (
    <div className="space-y-4">
      {controls}
      {body}
    </div>
  );
}
