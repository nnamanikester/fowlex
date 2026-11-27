"use client";

import * as React from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  ChartPlaceholder,
  formatValue,
  Legend,
  MAX_SERIES,
  TableView,
  TooltipCard,
  type Unit,
  useChartTheme,
} from "./chart-kit";

export type TrendRow = { label: string } & Record<string, number | string | null>;
/** `dots` marks each value: for sparse readings (weighings) rather than a continuous line. */
export type TrendSeries = { key: string; label: string; dots?: boolean };

/**
 * Change over time: one to six lines (revenue and expenses by month, feed used by day) on one
 * axis. A single series gets a soft wash under its line. Hover anywhere for every series at that
 * point; the legend and table view carry the same values. Series keep their slot in the order
 * given, so pass them in a fixed order.
 */
export function TrendChart({
  title,
  data,
  series,
  unit = "kobo",
  height = 260,
}: {
  /** What the chart shows, for screen readers and the table ("Revenue and expenses by month"). */
  title: string;
  data: TrendRow[];
  series: TrendSeries[];
  unit?: Unit;
  height?: number;
}) {
  const theme = useChartTheme();
  if (series.length > MAX_SERIES) throw new Error(`TrendChart takes up to ${MAX_SERIES} series; fold the rest.`);
  const color = (i: number) => theme.series[i];
  const single = series.length === 1;
  const ends = endLabels(data, series, height);

  return (
    <figure className="space-y-3">
      {!single && <Legend items={series.map((s, i) => ({ label: s.label, color: color(i) }))} />}
      <div role="img" aria-label={title} style={{ height }}>
        {theme.mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: ends.size ? 72 : 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: theme.axis }}
                tick={{ fill: theme.muted, fontSize: 12 }}
                tickMargin={8}
                minTickGap={16}
              />
              <YAxis
                width={64}
                tickLine={false}
                axisLine={false}
                tick={{ fill: theme.muted, fontSize: 12 }}
                tickFormatter={(v: number) => formatValue(v, unit, true)}
              />
              <Tooltip
                cursor={{ stroke: theme.axis, strokeWidth: 1 }}
                isAnimationActive={false}
                content={({ active, label, payload }) =>
                  active && payload?.length ? (
                    <TooltipCard
                      title={String(label)}
                      rows={series
                        .map((s, i) => ({ s, i, v: payload.find((p) => p.dataKey === s.key)?.value }))
                        .filter(({ v }) => typeof v === "number")
                        .map(({ s, i, v }) => ({
                          label: s.label,
                          value: formatValue(v as number, unit),
                          color: color(i),
                        }))}
                    />
                  ) : null
                }
              />
              {single && (
                <Area
                  dataKey={series[0].key}
                  stroke="none"
                  fill={color(0)}
                  fillOpacity={0.1}
                  isAnimationActive={false}
                  tooltipType="none"
                />
              )}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stroke={color(i)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={s.dots ? { r: 4, fill: color(i), stroke: theme.surface, strokeWidth: 2 } : false}
                  activeDot={{ r: 4, fill: color(i), stroke: theme.surface, strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                  label={
                    ends.has(s.key)
                      ? (props: { x?: number | string; y?: number | string; index?: number }) =>
                          props.index === data.length - 1 ? (
                            <text
                              key="end"
                              x={Number(props.x) + 8}
                              y={Number(props.y)}
                              dy={4}
                              fontSize={12}
                              fill={theme.ink}
                            >
                              {s.label}
                            </text>
                          ) : (
                            <g key={props.index} />
                          )
                      : undefined
                  }
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ChartPlaceholder height={height} />
        )}
      </div>
      <TableView
        caption={title}
        columns={["", ...series.map((s) => s.label)]}
        rows={data.map((row) => [
          row.label,
          ...series.map((s) => (typeof row[s.key] === "number" ? formatValue(row[s.key] as number, unit) : "–")),
        ])}
      />
    </figure>
  );
}

/**
 * Which series get their name at the end of the line: up to four, and only where the ends sit far
 * enough apart not to collide. Converging ends go unlabelled; the legend and tooltip cover them.
 */
function endLabels(data: TrendRow[], series: TrendSeries[], height: number) {
  const labelled = new Set<string>();
  if (series.length < 2 || series.length > 4 || !data.length) return labelled;
  const values = data.flatMap((row) => series.map((s) => row[s.key])).filter((v): v is number => typeof v === "number");
  const min = Math.min(0, ...values);
  const span = Math.max(...values) - min || 1;
  const last = data[data.length - 1];
  const ends = series
    .map((s) => ({
      key: s.key,
      y: typeof last[s.key] === "number" ? (((last[s.key] as number) - min) / span) * height : null,
    }))
    .filter((e): e is { key: string; y: number } => e.y !== null);
  for (const e of ends) if (ends.every((o) => o === e || Math.abs(o.y - e.y) >= 18)) labelled.add(e.key);
  return labelled;
}
