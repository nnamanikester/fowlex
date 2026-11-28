import { Suspense } from "react";
import type { Metadata } from "next";

import { ReportsBoard, type View } from "./_components/reports-board";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { addPnl, BASES, type Basis, batchesPnl, yearPnl } from "@/lib/finance/pnl";
import { requestToday } from "@/lib/page-data";
import { BatchModel } from "@/models/batch";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <RequirePermission permission="finance.read">
      <PageHeader
        title="Reports"
        description="Profit and loss by month and by batch: what came in, what it cost, and what's left."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Reports({ searchParams }: Pick<PageProps<"/reports">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const user = await requireUser();
  const today = await requestToday();
  const view: View = one(params.view) === "batches" ? "batches" : "months";
  const basis: Basis = BASES.includes(one(params.basis) as Basis) ? (one(params.basis) as Basis) : "accrual";
  const thisYear = Number(today.slice(0, 4));
  const first = await BatchModel.findOne({ farmId: user.farmId }, { placedOn: 1 }).sort({ placedOn: 1 }).lean();
  const firstYear = Math.min(thisYear, first ? Number(first.placedOn.slice(0, 4)) : thisYear);
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i);
  const asked = Number(one(params.year));
  const year = years.includes(asked) ? asked : thisYear;

  if (view === "batches") {
    const batches = await batchesPnl(user.farmId, basis, today);
    return (
      <ReportsBoard
        view={view}
        basis={basis}
        year={year}
        years={years}
        total={addPnl(batches)}
        months={[]}
        batches={batches}
      />
    );
  }
  const report = await yearPnl(user.farmId, year, basis, today);
  return (
    <ReportsBoard
      view={view}
      basis={basis}
      year={year}
      years={years}
      total={report}
      months={report.months}
      batches={[]}
    />
  );
}
