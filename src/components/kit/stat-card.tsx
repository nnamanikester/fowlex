import * as React from "react";

import { cn } from "@/lib/utils";

/** One headline number. Three or four in a row at most: show what someone acts on. */
export function StatCard({
  label,
  value,
  hint,
  trend,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** A change against the previous period, e.g. "+12%"; up is good unless `invert`. */
  trend?: {
    value: string;
    direction: "up" | "down" | "flat";
    invert?: boolean;
  };
  className?: string;
}) {
  const good = trend && trend.direction !== "flat" && (trend.direction === "up") !== !!trend.invert;
  return (
    // min-w-0: a long amount never widens its column (on a phone that zooms the whole page out).
    <div className={cn("min-w-0 rounded-xl border border-line bg-surface p-5 shadow-card", className)}>
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="num mt-1.5 text-3xl font-extrabold tracking-tight text-fg-heading [overflow-wrap:anywhere]">
        {value}
      </p>
      {(hint || trend) && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-subtle">
          {trend && (
            <span
              className={cn(
                "font-medium tabular-nums",
                trend.direction === "flat" ? "text-fg-muted" : good ? "text-success-fg" : "text-danger-fg",
              )}
            >
              {trend.value}
            </span>
          )}
          {hint}
        </p>
      )}
    </div>
  );
}
