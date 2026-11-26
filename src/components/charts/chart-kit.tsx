"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { Skeleton } from "@/components/ui/skeleton";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The categorical order for chart series: the data-viz reference palette re-ordered to blue,
 * orange, violet, magenta, yellow, aqua. Green and red are left out because here they mean profit
 * and loss, and aqua (closest to profit green) comes last. Validated as a set in both modes against
 * the card surfaces (#ffffff, #101b20): adjacent CVD ΔE ≥ 9.1 light / 8.4 dark, normal-vision ΔE
 * ≥ 19.3. Slots 4–6 sit under 3:1 on white, so every chart ships a legend with values or a table.
 * Assign in this order, never cycled: a 7th part folds into "Other" (neutral gray).
 */
const SERIES = {
  light: ["#2a78d6", "#eb6834", "#4a3aa7", "#e87ba4", "#eda100", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#9085e9", "#d55181", "#c98500", "#199e70"],
} as const;

/** Chart chrome from the app's tokens: gridlines (line), baseline (line-strong), muted text, ink, surface. */
const CHROME = {
  light: { grid: "#e8e1d5", axis: "#d3cabb", muted: "#646d70", ink: "#16232a", surface: "#ffffff", other: "#a7a197" },
  dark: { grid: "#1b2b32", axis: "#2a3f47", muted: "#87938f", ink: "#e9e4db", surface: "#101b20", other: "#5c6a6f" },
} as const;

export const MAX_SERIES = SERIES.light.length;

const noop = () => () => {};

/** The colours for the current theme, and whether the chart can draw yet (after hydration). */
export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const mode = resolvedTheme === "dark" ? "dark" : "light";
  return { mounted, series: SERIES[mode], ...CHROME[mode] };
}

/** What the numbers are: kobo shows as naira, counts as plain numbers. */
export type Unit = "kobo" | "count";

export function formatValue(value: number, unit: Unit, compact = false) {
  if (unit === "kobo") return formatNaira(Math.round(value), { compact });
  // Compact only shortens thousands ("12.5K"); smaller numbers keep two decimals, so an axis at
  // 0.65 kg never reads as 0.7.
  const short = compact && Math.abs(value) >= 1000;
  return new Intl.NumberFormat(
    "en-NG",
    short ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 2 },
  ).format(value);
}

/** Holds the chart's place (same height) until it can draw, so nothing jumps. */
export function ChartPlaceholder({ height }: { height: number }) {
  return <Skeleton style={{ height }} className="w-full rounded-xl" />;
}

/** The legend: a key that mirrors the mark (a line, a dashed line, or a block) beside its name. */
export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; key?: "line" | "dashed" | "block" }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted", className)}>
      {items.map(({ label, color, key = "line" }) => (
        <li key={label} className="flex items-center gap-1.5">
          <Key color={color} kind={key} />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function Key({ color, kind = "line" }: { color: string; kind?: "line" | "dashed" | "block" }) {
  if (kind === "block")
    return <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: color }} />;
  return (
    <svg aria-hidden width="14" height="4" className="shrink-0">
      <line
        x1="1"
        y1="2"
        x2="13"
        y2="2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={kind === "dashed" ? "3 3" : undefined}
      />
    </svg>
  );
}

/** The hover readout: the x label, then every series with its value first and name second. */
export function TooltipCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color: string; kind?: "line" | "dashed" | "block" }[];
}) {
  return (
    <div className="min-w-40 rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-medium text-fg-subtle">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <Key color={r.color} kind={r.kind} />
            <span className="num font-bold text-fg">{r.value}</span>
            <span className="text-fg-muted">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every value a chart shows, as a table: the way to read it without hovering or seeing colour. */
export function TableView({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="group text-sm">
      <summary className="focus-ring inline-flex cursor-pointer select-none items-center rounded-md text-xs font-semibold text-brand-fg hover:underline">
        <span className="group-open:hidden">View as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <div className="mt-2 overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-subtle text-fg-muted">
            <tr>
              {columns.map((c, i) => (
                <th key={c} scope="col" className={cn("px-3 py-2 font-semibold", i ? "text-right" : "text-left")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row[0])} className="border-t border-line">
                {row.map((cell, i) =>
                  i ? (
                    <td key={i} className="num px-3 py-1.5 text-right text-fg">
                      {cell}
                    </td>
                  ) : (
                    <th key={i} scope="row" className="px-3 py-1.5 text-left font-medium text-fg">
                      {cell}
                    </th>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
