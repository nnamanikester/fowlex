"use client";

import * as React from "react";

import { formatValue, MAX_SERIES, type Unit, useChartTheme } from "./chart-kit";
import { cn } from "@/lib/utils";

export type Part = { label: string; value: number };

/**
 * Part of a whole (expenses by category, sales by customer): one stacked bar, split with 2px gaps,
 * and a legend that lists every part with its value and share, so it reads without colour or hover.
 * Pass parts in a fixed order (the category order, not by size) so each keeps its colour when the
 * numbers move. Past six, the smallest fold into a gray "Other".
 *
 * A stacked bar rather than the plan's donut: lengths along one line are easier to compare than
 * angles round a ring.
 */
export function BreakdownBar({ title, parts, unit = "kobo" }: { title: string; parts: Part[]; unit?: Unit }) {
  const theme = useChartTheme();
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = fold(parts.filter((p) => p.value > 0));
  const total = shown.reduce((sum, p) => sum + p.value, 0);
  const share = (v: number) => `${(total ? (v / total) * 100 : 0).toFixed(1)}%`;
  const colour = (i: number) => (shown[i].label === OTHER ? theme.other : theme.series[i]);

  if (!total) return <p className="text-sm text-fg-muted">Nothing recorded for this period.</p>;

  return (
    <figure className="space-y-4" aria-label={title}>
      <div className="relative">
        <div className="flex h-4 w-full gap-0.5" onPointerLeave={() => setHover(null)}>
          {shown.map((p, i) => (
            <button
              key={p.label}
              type="button"
              aria-label={`${p.label}: ${formatValue(p.value, unit)}, ${share(p.value)}`}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              style={{ flexGrow: p.value, background: theme.mounted ? colour(i) : undefined }}
              className={cn(
                "focus-ring min-w-[3px] basis-0 bg-surface-muted transition-opacity first:rounded-l last:rounded-r",
                hover !== null && hover !== i && "opacity-40",
              )}
            />
          ))}
        </div>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-line bg-surface-raised px-3 py-2 text-xs shadow-pop"
          >
            <span className="num font-bold text-fg">{formatValue(shown[hover].value, unit)}</span>{" "}
            <span className="text-fg-muted">
              {shown[hover].label} · {share(shown[hover].value)}
            </span>
          </div>
        )}
      </div>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {shown.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm bg-surface-muted"
              style={{ background: theme.mounted ? colour(i) : undefined }}
            />
            <span className="min-w-0 flex-1 truncate text-fg">{p.label}</span>
            <span className="num font-semibold text-fg">{formatValue(p.value, unit)}</span>
            <span className="num w-12 text-right text-xs text-fg-subtle">{share(p.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const OTHER = "Other";

/** Keep the largest six (in their given order) and fold the rest into "Other" at the end. */
function fold(parts: Part[]): Part[] {
  if (parts.length <= MAX_SERIES) return parts;
  const keep = new Set([...parts].sort((a, b) => b.value - a.value).slice(0, MAX_SERIES - 1));
  const rest = parts.filter((p) => !keep.has(p)).reduce((sum, p) => sum + p.value, 0);
  return [...parts.filter((p) => keep.has(p)), { label: OTHER, value: rest }];
}
