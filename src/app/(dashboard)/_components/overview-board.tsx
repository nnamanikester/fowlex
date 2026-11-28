"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, FileClock, FileSignature, Receipt } from "lucide-react";

import { ForecastChart, TrendChart } from "@/components/charts";
import { Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import type { BatchView } from "@/lib/batches/service";
import type { Overview } from "@/lib/finance/overview";
import { formatNaira } from "@/lib/money";
import { Figure, margin, Verdict } from "../reports/_components/reports-board";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1];
const ICONS = { overdue: FileClock, contract: FileSignature, approval: Receipt };

/** Money at a glance, the batches on the farm, and what needs someone's attention. */
export function OverviewBoard({ data, batches }: { data: Overview; batches: BatchView[] }) {
  const { month, year } = data;
  const birds = batches.reduce((n, b) => n + b.liveBirds, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Income this month"
          value={<Figure kobo={month.incomeKobo} />}
          hint={`${formatNaira(year.incomeKobo)} this year`}
        />
        <StatCard
          label="Costs this month"
          value={<Figure kobo={month.costKobo} />}
          hint={`${formatNaira(year.costKobo)} this year`}
        />
        <StatCard
          label={
            <span className="inline-flex items-center gap-2">
              Net profit <Verdict p={month} />
            </span>
          }
          value={<Figure kobo={month.profitKobo} />}
          hint={`${formatNaira(year.profitKobo)} this year`}
        />
        <StatCard label="Margin" value={margin(month)} hint={`${margin(year)} this year`} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Live birds"
          value={birds.toLocaleString("en-NG")}
          hint={`In ${batches.length} batch${batches.length === 1 ? "" : "es"}`}
        />
        <StatCard
          label="Customers owe"
          value={<Figure kobo={data.owedKobo} />}
          hint={data.overdue.count ? `${formatNaira(data.overdue.kobo)} overdue` : "Nothing overdue"}
        />
        <StatCard
          className="col-span-2 lg:col-span-1"
          label="In Paystack"
          value={data.paystackKobo === null ? "–" : <Figure kobo={data.paystackKobo} />}
          hint={data.paystackKobo === null ? "Paystack isn't connected" : "The farm's Paystack balance"}
        />
      </div>

      {data.alerts.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning-fg" aria-hidden /> Needs attention
            </span>
          }
          flush
        >
          <ul className="divide-y divide-line">
            {data.alerts.map((a) => {
              const Icon = ICONS[a.kind];
              return (
                <li key={`${a.kind}-${a.href}`}>
                  <Link href={a.href} className="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle">
                    <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block font-semibold text-fg">{a.title}</span>
                      <span className="block text-xs text-fg-muted">{a.detail}</span>
                    </span>
                    <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Income and costs" description="The last six months, as invoiced.">
          <TrendChart
            title="Income and costs by month"
            data={data.trend.map((m) => ({ label: short(m.month), income: m.incomeKobo, costs: m.costKobo }))}
            series={[
              { key: "income", label: "Income" },
              { key: "costs", label: "Costs" },
            ]}
          />
        </Panel>
        <Panel title="Income ahead" description="The next two months, from the last three: a rough guide.">
          <ForecastChart
            title="Income by month, and the next two"
            measure="Income"
            rangeLabel="Lowest to highest of the last three"
            data={data.forecast.map((p) => ({
              label: short(p.month),
              actual: p.actualKobo,
              forecast: p.forecastKobo,
              low: p.lowKobo,
              high: p.highKobo,
            }))}
          />
        </Panel>
      </div>

      <Panel title="On the farm" description="Batches being raised or sold." flush>
        {batches.length ? (
          <ul className="divide-y divide-line">
            {batches.map((b) => {
              const mortality = b.placed ? Math.round((b.totals.deaths / b.placed) * 1000) / 10 : 0;
              return (
                <li key={b.id}>
                  <Link
                    href={`/batches/${b.id}`}
                    className="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle"
                  >
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block font-mono font-semibold text-fg">{b.code}</span>
                      <span className="block text-xs text-fg-muted">
                        Day {b.ageDays} · {b.liveBirds.toLocaleString("en-NG")} birds · {b.houseName}
                      </span>
                    </span>
                    <Badge tone={mortality >= 5 ? "danger" : mortality >= 3 ? "warning" : "neutral"}>
                      {mortality.toLocaleString("en-NG")}% died
                    </Badge>
                    <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-muted">No batches on the farm right now.</p>
        )}
      </Panel>
    </div>
  );
}
