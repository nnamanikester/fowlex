"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartPlaceholder, formatValue, Legend, TableView, TooltipCard, type Unit, useChartTheme } from "./chart-kit";

export type ForecastRow = {
  label: string;
  /** What happened. Empty after today. */
  actual?: number | null;
  /** What we expect. Give the last actual row a forecast equal to its actual, so the line joins. */
  forecast?: number | null;
  /** The likely range around the forecast (80%). */
  low?: number | null;
  high?: number | null;
};

/**
 * History and what comes next, for one measure (revenue, profit): the actual line, the forecast
 * continuing it as a dashed line in the same colour, the likely range as a soft band that widens
 * further out, and a "Today" rule where one meets the other.
 */
export function ForecastChart({
  title,
  measure,
  data,
  unit = "kobo",
  height = 280,
}: {
  title: string;
  /** The measure's name ("Revenue"), for the legend and tooltip. */
  measure: string;
  data: ForecastRow[];
  unit?: Unit;
  height?: number;
}) {
  const theme = useChartTheme();
  const color = theme.series[0];
  const todayLabel = [...data].reverse().find((r) => typeof r.actual === "number")?.label;
  const rows = data.map((r) => ({ ...r, range: r.low != null && r.high != null ? [r.low, r.high] : null }));

  return (
    <figure className="space-y-3">
      <Legend
        items={[
          { label: measure, color },
          { label: "Forecast", color, key: "dashed" },
          { label: "Likely range (80%)", color: `${color}33`, key: "block" },
        ]}
      />
      <div role="img" aria-label={title} style={{ height }}>
        {theme.mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 20, right: 12, bottom: 0, left: 0 }}>
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
                content={({ active, label, payload }) => {
                  const row = payload?.[0]?.payload as ForecastRow | undefined;
                  if (!active || !row) return null;
                  const items = [];
                  if (typeof row.actual === "number")
                    items.push({ label: measure, value: formatValue(row.actual, unit), color });
                  else if (typeof row.forecast === "number")
                    items.push({
                      label: "Forecast",
                      value: formatValue(row.forecast, unit),
                      color,
                      kind: "dashed" as const,
                    });
                  if (row.low != null && row.high != null && typeof row.actual !== "number")
                    items.push({
                      label: "Likely range",
                      value: `${formatValue(row.low, unit, true)} – ${formatValue(row.high, unit, true)}`,
                      color: `${color}33`,
                      kind: "block" as const,
                    });
                  return <TooltipCard title={String(label)} rows={items} />;
                }}
              />
              <Area
                dataKey="range"
                stroke="none"
                fill={color}
                fillOpacity={0.12}
                isAnimationActive={false}
                tooltipType="none"
                connectNulls
              />
              {todayLabel && (
                <ReferenceLine
                  x={todayLabel}
                  stroke={theme.axis}
                  strokeWidth={1}
                  label={{ value: "Today", position: "top", fill: theme.muted, fontSize: 12 }}
                />
              )}
              <Line
                dataKey="forecast"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, fill: color, stroke: theme.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Line
                dataKey="actual"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, fill: color, stroke: theme.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ChartPlaceholder height={height} />
        )}
      </div>
      <TableView
        caption={title}
        columns={["", measure, "Forecast", "Likely range"]}
        rows={data.map((r) => [
          r.label,
          typeof r.actual === "number" ? formatValue(r.actual, unit) : "–",
          typeof r.forecast === "number" && typeof r.actual !== "number" ? formatValue(r.forecast, unit) : "–",
          r.low != null && r.high != null && typeof r.actual !== "number"
            ? `${formatValue(r.low, unit)} – ${formatValue(r.high, unit)}`
            : "–",
        ])}
      />
    </figure>
  );
}
