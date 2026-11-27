import { CircleAlert, TriangleAlert } from "lucide-react";

import { Panel } from "@/components/kit";
import { type BudgetRow } from "@/lib/expenses/budget";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

const BAR = { ok: "bg-brand", warning: "bg-warning", over: "bg-danger" } as const;

/** One category's month against its budget: a bar, and the words (never colour alone). */
export function BudgetBar({ row }: { row: BudgetRow }) {
  const words =
    row.state === "over"
      ? `${formatNaira(-row.leftKobo)} over`
      : row.state === "warning"
        ? `${row.percent}% used · ${formatNaira(row.leftKobo)} left`
        : `${formatNaira(row.leftKobo)} left`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-fg">
          {row.state === "over" && <CircleAlert className="size-4 text-danger-fg" aria-hidden />}
          {row.state === "warning" && <TriangleAlert className="size-4 text-warning-fg" aria-hidden />}
          {row.name}
        </span>
        <span className="num text-fg-muted">
          {formatNaira(row.spentKobo)} of {formatNaira(row.budgetKobo)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${row.name} budget`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(row.percent, 100)}
        aria-valuetext={words}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={cn("h-full rounded-full", BAR[row.state])}
          style={{ width: `${Math.min(row.percent, 100)}%` }}
        />
      </div>
      <p
        className={cn(
          "text-xs",
          row.state === "over"
            ? "font-semibold text-danger-fg"
            : row.state === "warning"
              ? "font-semibold text-warning-fg"
              : "text-fg-subtle",
        )}
      >
        {words}
      </p>
    </div>
  );
}

/** This month's budgets on the Expenses page; nothing when no category has one. */
export function BudgetsPanel({ rows }: { rows: BudgetRow[] }) {
  if (!rows.length) return null;
  const over = rows.filter((r) => r.state === "over").length;
  const warn = rows.filter((r) => r.state === "warning").length;
  return (
    <Panel
      title="Budgets this month"
      description={
        over || warn
          ? [over && `${over} over budget`, warn && `${warn} nearly there`].filter(Boolean).join(" · ")
          : "Approved spending against each category's monthly budget."
      }
    >
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.key}>
            <BudgetBar row={r} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}
