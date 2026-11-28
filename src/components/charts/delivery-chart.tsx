"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartPlaceholder, formatValue, Legend, TableView, TooltipCard, useChartTheme } from "./chart-kit";

export type DeliveryRow = { label: string; ordered: number; delivered: number };

/**
 * A contract's weeks or months side by side: birds ordered and birds delivered in each, against
 * the agreed minimum as a dashed line. Periods still to come show empty, so the shape of what's
 * left is plain. Hover for a period's numbers; the table view carries them all.
 */
export function DeliveryChart({
  title,
  data,
  minimum,
  height = 240,
}: {
  title: string;
  data: DeliveryRow[];
  /** The birds a period should reach, when the contract sets a minimum. */
  minimum: number | null;
  height?: number;
}) {
  const theme = useChartTheme();
  const ordered = theme.series[1];
  const delivered = theme.series[0];
  return (
    <figure className="space-y-3">
      <Legend
        items={[
          { label: "Delivered", color: delivered, key: "block" },
          { label: "Ordered", color: ordered, key: "block" },
          ...(minimum ? [{ label: "Agreed minimum", color: theme.muted, key: "dashed" as const }] : []),
        ]}
      />
      <div role="img" aria-label={title} style={{ height }}>
        {theme.mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: theme.axis }}
                tick={{ fill: theme.muted, fontSize: 12 }}
                tickMargin={8}
                minTickGap={8}
              />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tick={{ fill: theme.muted, fontSize: 12 }}
                tickFormatter={(v: number) => formatValue(v, "count", true)}
              />
              <Tooltip
                cursor={{ fill: theme.grid, opacity: 0.5 }}
                isAnimationActive={false}
                content={({ active, label, payload }) =>
                  active && payload?.length ? (
                    <TooltipCard
                      title={String(label)}
                      rows={[
                        {
                          label: "delivered",
                          value: formatValue(Number(payload[0]?.payload.delivered), "count"),
                          color: delivered,
                          kind: "block",
                        },
                        {
                          label: "ordered",
                          value: formatValue(Number(payload[0]?.payload.ordered), "count"),
                          color: ordered,
                          kind: "block",
                        },
                        ...(minimum
                          ? [
                              {
                                label: "agreed",
                                value: formatValue(minimum, "count"),
                                color: theme.muted,
                                kind: "dashed" as const,
                              },
                            ]
                          : []),
                      ]}
                    />
                  ) : null
                }
              />
              {minimum ? (
                <ReferenceLine
                  y={minimum}
                  stroke={theme.muted}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  ifOverflow="extendDomain"
                />
              ) : null}
              <Bar
                dataKey="delivered"
                fill={delivered}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
              <Bar dataKey="ordered" fill={ordered} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartPlaceholder height={height} />
        )}
      </div>
      <TableView
        caption={title}
        columns={["Period", "Delivered", "Ordered", ...(minimum ? ["Agreed"] : [])]}
        rows={data.map((d) => [d.label, d.delivered, d.ordered, ...(minimum ? [minimum] : [])])}
      />
    </figure>
  );
}
