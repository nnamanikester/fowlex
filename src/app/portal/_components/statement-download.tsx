"use client";

import * as React from "react";
import { FileDown } from "lucide-react";

import { DateRangePicker } from "@/components/kit";
import { buttonClasses } from "@/components/ui/button";
import { type DateRange, presetRange } from "@/lib/dates";

/** Choose a period and download the statement for it. */
export function StatementDownload({ today }: { today: string }) {
  const [range, setRange] = React.useState<DateRange>(() => presetRange("this-year", today));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker value={range} onChange={setRange} label="Statement period" />
      <a
        href={`/api/portal/statement?from=${range.from}&to=${range.to}`}
        download
        className={buttonClasses({ variant: "secondary", size: "sm" })}
      >
        <FileDown /> Download statement
      </a>
    </div>
  );
}
