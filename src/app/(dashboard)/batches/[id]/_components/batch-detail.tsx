"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  ClipboardPen,
  Hammer,
  MoreHorizontal,
  PackageCheck,
  Pencil,
  RotateCcw,
  ShoppingCart,
  Sprout,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { CloseSheet } from "./close-sheet";
import { ChicksExpense, CostsTab } from "./costs-tab";
import { PickUpSheet } from "../../_components/book-chicks";
import { HealthTab, type StockChoice } from "./health-tab";
import { BatchSheet } from "../../_components/batch-sheet";
import { PHASE_TONE } from "../../_components/batches-board";
import { TrendChart } from "@/components/charts/trend-chart";
import { HealthAlerts } from "@/components/health-alerts";
import { ConfirmDialog, EmptyState, Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { apiRequest } from "@/lib/auth/client";
import { useAction } from "@/lib/use-action";
import { batchKpis, growthRows, vsStandard } from "@/lib/batches/kpis";
import { ageOn, formatAge, PHASE_LABELS, targetDate } from "@/lib/batches/rules";
import type { BatchCosts } from "@/lib/batches/costs";
import type { BatchView } from "@/lib/batches/service";
import type { CategoryView } from "@/lib/expenses/categories";
import { formatRange } from "@/lib/dates";
import { needsAttention, vaccinationPlan, withdrawalUntil } from "@/lib/health/rules";
import type { HealthView } from "@/lib/health/service";
import type { HouseView } from "@/lib/houses/service";
import { bags } from "@/lib/logs/rules";
import type { LogView } from "@/lib/logs/service";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

const TABS = [
  ["overview", "Overview", null],
  ["logs", "Daily logs", null],
  ["health", "Health", null],
  ["costs", "Costs", null],
  ["sales", "Sales", "6.3"],
] as const;
type Tab = (typeof TABS)[number][0];

const n = (x: number) => x.toLocaleString("en-NG");
const day = (d: string) => formatRange({ from: d, to: d });

/** One batch: where it stands, its placement and targets, and (as later steps arrive) its records. */
export function BatchDetail({
  batch: b,
  houses,
  logs,
  health,
  today,
  tab,
  canWrite,
  canLog,
  canManageHouses,
  costs = null,
  stock = [],
  categories = [],
  hatcheries = [],
  canSpend = false,
}: {
  /** What the batch has cost (for those who see money); null hides the money. */
  costs?: BatchCosts | null;
  /** Drugs and vaccines in stock, for health records. */
  stock?: StockChoice[];
  categories?: CategoryView[];
  hatcheries?: { id: string; name: string; chicks: boolean }[];
  canSpend?: boolean;
  batch: BatchView;
  houses: HouseView[];
  logs: LogView[];
  health: HealthView[];
  canLog: boolean;
  today: string;
  tab: Tab;
  canWrite: boolean;
  canManageHouses: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [pickingUp, setPickingUp] = React.useState(false);
  const [reopening, setReopening] = React.useState(false);
  const open = b.phase !== "closed";

  const action = useAction();
  const setStatus = (status: "active" | "selling") =>
    action.run(() => apiRequest(`/api/batches/${b.id}/status`, "POST", { status }), {
      progress: status === "selling" ? `Moving ${b.code} to selling…` : `Moving ${b.code} back to growing…`,
      success: status === "selling" ? `${b.code} is now selling.` : `${b.code} is back to growing.`,
      onSuccess: () => router.refresh(),
    });

  const daysLeft = b.targetSellAgeDays - b.ageDays;
  const plan = vaccinationPlan(
    b,
    new Map(health.filter((e) => e.scheduleKey).map((e) => [e.scheduleKey!, e.date])),
    today,
  );
  const withdrawal = open ? withdrawalUntil(health, today) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/batches"
          className="focus-ring inline-flex items-center gap-1 rounded-md text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden /> Batches
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight text-fg-heading">{b.code}</h1>
              <Badge tone={PHASE_TONE[b.phase]}>{PHASE_LABELS[b.phase]}</Badge>
            </div>
            <p className="text-sm text-fg-muted">
              {b.houseName} · {b.breed} · placed {day(b.placedOn)}
            </p>
          </div>
          {canWrite && (
            <Menu
              label={`${b.code} actions`}
              align="end"
              trigger={({ ref, ...props }) => (
                <Button ref={ref} variant="secondary" size="icon" aria-label={`${b.code} actions`} {...props}>
                  <MoreHorizontal />
                </Button>
              )}
            >
              {!open && (
                <MenuItem icon={<RotateCcw />} onSelect={() => setReopening(true)}>
                  Reopen batch
                </MenuItem>
              )}
              {open && (
                <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
                  Edit batch
                </MenuItem>
              )}
              {b.phase === "active" && (
                <MenuItem icon={<ShoppingCart />} onSelect={() => void setStatus("selling")}>
                  Start selling
                </MenuItem>
              )}
              {b.phase === "selling" && (
                <MenuItem icon={<Sprout />} onSelect={() => void setStatus("active")}>
                  Back to growing
                </MenuItem>
              )}
              {open && b.phase !== "planned" && (
                <MenuItem icon={<Archive />} onSelect={() => setClosing(true)}>
                  Close batch
                </MenuItem>
              )}
              {open && <MenuSeparator />}
              {open && (
                <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => setDeleting(true)}>
                  Delete batch
                </MenuItem>
              )}
            </Menu>
          )}
        </div>
      </div>

      <nav
        aria-label="Batch sections"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0"
      >
        {TABS.filter(([id]) => id !== "costs" || costs).map(([id, label]) => (
          <Link
            key={id}
            href={id === "overview" ? `/batches/${b.id}` : `/batches/${b.id}?tab=${id}`}
            scroll={false}
            aria-current={tab === id ? "page" : undefined}
            className={cn(
              "focus-ring -mb-px shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
              tab === id ? "border-brand text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {b.phase === "planned" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info-line bg-info-subtle px-4 py-3 text-sm">
          <span className="flex-1 text-fg">
            <strong>Booked:</strong> {n(b.bookedChicks ?? b.placed)} chicks
            {b.supplierName ? ` from ${b.supplierName}` : ""}, to pick up{" "}
            {b.placedOn === today ? "today" : day(b.placedOn)}. When you collect them, tap Chicks picked up.
          </span>
          {canWrite && (
            <Button size="sm" onClick={() => setPickingUp(true)}>
              <PackageCheck /> Chicks picked up
            </Button>
          )}
        </div>
      )}
      {!open && b.closedOn && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-fg"
        >
          <Archive className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden />
          <span>
            Closed on <strong>{day(b.closedOn)}</strong>. Its daily logs and health record are locked.
          </span>
        </div>
      )}
      {open && b.phase !== "planned" && b.liveBirds === 0 && canWrite && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-success-line bg-success-subtle px-4 py-3 text-sm"
        >
          <span className="flex-1 text-fg">Every bird is accounted for. Close the batch to lock its records.</span>
          <Button size="sm" onClick={() => setClosing(true)}>
            Close batch
          </Button>
        </div>
      )}

      {tab === "overview" ? (
        <>
          <HealthAlerts
            attention={b.phase === "planned" ? [] : needsAttention(plan)}
            withdrawal={withdrawal}
            href={`/batches/${b.id}?tab=health`}
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Live birds" value={n(b.liveBirds)} hint={`of ${n(b.placed)} placed`} />
            <StatCard
              label="Age"
              value={b.phase === "planned" ? "Not placed" : formatAge(b.ageDays).split(" · ")[0]}
              hint={b.phase === "planned" ? `Arrives ${day(b.placedOn)}` : formatAge(b.ageDays).split(" · ")[1]}
            />
            <StatCard
              label="Mortality"
              value={`${b.placed ? (((b.totals.deaths + b.totals.culls) / b.placed) * 100).toFixed(1) : "0.0"}%`}
              hint={`${n(b.totals.deaths)} dead, ${n(b.totals.culls)} culled${b.totals.sold ? `, ${n(b.totals.sold)} sold` : ""}`}
            />
            <StatCard
              label="To target"
              value={
                b.phase === "planned" ? `${b.targetSellAgeDays} days` : daysLeft > 0 ? `${daysLeft} days` : "Reached"
              }
              hint={`${(b.targetWeightGrams / 1000).toFixed(1)} kg by ${day(targetDate(b))}`}
            />
          </div>

          {b.phase !== "planned" && <Performance batch={b} logs={logs} today={today} />}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Placement">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact label="Placed on" value={day(b.placedOn)} />
                <Fact label="House" value={b.houseName} />
                <Fact label="Chicks delivered" value={n(b.delivered)} />
                <Fact label="Dead on arrival" value={n(b.deadOnArrival)} />
                <Fact label="Free extras" value={n(b.freeExtras)} />
                <Fact label="Placed alive" value={n(b.placed)} />
                {b.shortfall > 0 && (
                  <Fact label="Short from the hatchery" value={`${n(b.shortfall)} chicks owed to you`} />
                )}
                <Fact label="Price per chick" value={formatNaira(b.pricePerChickKobo)} />
                <Fact label={`Chicks cost (${n(b.paid)} paid)`} value={formatNaira(b.chickCostKobo)} />
                <Fact
                  label="Hatchery"
                  value={
                    b.supplierId ? (
                      <Link href={`/suppliers/${b.supplierId}`} className="focus-ring rounded-md text-brand-fg">
                        {b.supplierName}
                      </Link>
                    ) : (
                      b.supplierName || "–"
                    )
                  }
                />
                {costs && <Fact label="Chicks expense" value={<ChicksExpense batch={b} canRecord={canSpend} />} />}
                <Fact
                  label="Age when placed"
                  value={b.ageAtPlacementDays ? `${b.ageAtPlacementDays} days` : "Day-old"}
                />
              </dl>
            </Panel>
            <Panel title="Targets">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact
                  label="Sell at"
                  value={`${b.targetSellAgeDays} days (${Math.round((b.targetSellAgeDays / 7) * 10) / 10} weeks)`}
                />
                <Fact label="Around" value={day(targetDate(b))} />
                <Fact label="Target weight" value={`${(b.targetWeightGrams / 1000).toFixed(2)} kg`} />
                <Fact label="Breed" value={b.breed} />
              </dl>
              {b.notes && (
                <p className="mt-4 whitespace-pre-line border-t border-line pt-3 text-sm text-fg-muted">{b.notes}</p>
              )}
            </Panel>
          </div>
        </>
      ) : tab === "costs" && costs ? (
        <CostsTab batch={b} costs={costs} categories={categories} canSpend={canSpend} />
      ) : tab === "health" ? (
        <HealthTab
          batch={b}
          plan={plan}
          events={health}
          today={today}
          canLog={canLog && open}
          canWrite={canWrite}
          stock={stock}
        />
      ) : tab === "logs" ? (
        <DailyLogs logs={logs} batch={b} canLog={canLog && open} />
      ) : (
        <Panel>
          <EmptyState
            icon={<Hammer />}
            title="Not built yet"
            description={`${TABS.find(([id]) => id === tab)![1]} for this batch arrive in step ${TABS.find(([id]) => id === tab)![2]} of the build plan.`}
          />
        </Panel>
      )}

      {canWrite && (
        <BatchSheet
          open={editing}
          onClose={() => setEditing(false)}
          batch={b}
          houses={houses}
          today={today}
          canManageHouses={canManageHouses}
          hatcheries={hatcheries}
          onSaved={(saved) => {
            setEditing(false);
            toast.success(`${saved.code} saved.`);
            router.refresh();
          }}
        />
      )}

      {pickingUp && <PickUpSheet batch={b} houses={houses} today={today} onClose={() => setPickingUp(false)} />}
      {closing && (
        <CloseSheet
          batch={b}
          lastRecord={[b.placedOn, ...logs.map((l) => l.date), ...health.map((e) => e.date)].sort().at(-1)!}
          today={today}
          canLog={canLog}
          onClose={() => setClosing(false)}
        />
      )}
      <ConfirmDialog
        open={reopening}
        onOpenChange={setReopening}
        title={`Reopen ${b.code}?`}
        description="Its logs and health record unlock, and it shows as selling again. Do this only if it was closed by mistake."
        confirmLabel="Reopen batch"
        destructive={false}
        onConfirm={async () => {
          await apiRequest(`/api/batches/${b.id}/reopen`, "POST");
          toast.success(`${b.code} is open again.`);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${b.code}?`}
        description="It leaves your batches and reports. It stays in the audit log."
        confirmLabel="Delete batch"
        typeToConfirm={b.code}
        onConfirm={async () => {
          await apiRequest(`/api/batches/${b.id}`, "DELETE");
          toast.success(`${b.code} deleted.`);
          router.replace("/batches");
          router.refresh();
        }}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="num truncate font-medium text-fg">{value}</dd>
    </div>
  );
}

/** The batch's days, newest first: a card per day on phones. */
function DailyLogs({ logs, batch, canLog }: { logs: LogView[]; batch: BatchView; canLog: boolean }) {
  const action = canLog ? (
    <LinkButton href={`/log?batch=${batch.id}`} size="sm">
      <ClipboardPen /> Log a day
    </LinkButton>
  ) : undefined;
  if (!logs.length)
    return (
      <Panel>
        <EmptyState
          icon={<ClipboardPen />}
          title="No days logged yet"
          description="Each day's deaths, culls, feed and water, logged from a phone in the house."
          action={action}
        />
      </Panel>
    );
  return (
    <Panel title={`${logs.length} day${logs.length === 1 ? "" : "s"} logged`} actions={action} flush>
      <ul className="divide-y divide-line">
        {logs.map((l) => (
          <li key={l.id} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
            <span className="font-semibold text-fg">
              {day(l.date)}
              <span className="block text-xs font-normal text-fg-subtle">Day {Math.max(0, ageOn(batch, l.date))}</span>
            </span>
            <span className="num flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
              <span>
                <strong className="text-fg">{l.deaths}</strong> dead
              </span>
              <span>
                <strong className="text-fg">{l.culls}</strong> culled
              </span>
              {l.sold > 0 && (
                <span>
                  <strong className="text-fg">{n(l.sold)}</strong> taken for sale
                </span>
              )}
              <span>
                <strong className="text-fg">{l.feedKg}</strong> kg {l.feedType.toLowerCase()} ({bags(l.feedKg)})
              </span>
              {l.waterLitres !== null && (
                <span>
                  <strong className="text-fg">{n(l.waterLitres)}</strong> L water
                </span>
              )}
              {l.avgWeightGrams !== null && (
                <span>
                  <strong className="text-fg">{(l.avgWeightGrams / 1000).toFixed(2)}</strong> kg average
                </span>
              )}
              {l.notes && <span className="basis-full text-fg-subtle">{l.notes}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** How the flock is doing: the standard broiler numbers, and growth against the breed standard. */
function Performance({ batch, logs, today }: { batch: BatchView; logs: LogView[]; today: string }) {
  const k = batchKpis(batch, logs);
  const gap = vsStandard(k.weighed);
  const rows = growthRows(batch, logs, today);
  const fmt = (v: number | null, suffix = "") => (v === null ? "–" : `${v.toLocaleString("en-NG")}${suffix}`);
  const needsWeight = k.weighed ? `At day ${k.weighed.age}` : "Weigh birds to see this";
  const needsFeed = k.feedGaps ? `Feed missing for ${k.feedGaps} day${k.feedGaps === 1 ? "" : "s"}` : needsWeight;
  return (
    <Panel
      title="Performance"
      description={
        k.weighed
          ? `Weights from ${day(k.weighed.date)} (day ${k.weighed.age}), ${(k.weighed.grams / 1000).toFixed(2)} kg average${
              gap === null ? "" : `, ${gap >= 0 ? `${gap}% above` : `${Math.abs(gap)}% below`} the Ross 308 standard`
            }.`
          : "Log an average weight to see FCR, daily gain and EPEF."
      }
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <Kpi label="Livability" value={fmt(k.livability, "%")} hint={`Mortality ${fmt(k.mortality, "%")}`} />
          <Kpi label="Feed per bird" value={fmt(k.feedPerBirdKg, " kg")} hint={`${fmt(k.feedKg)} kg in all`} />
          <Kpi label="FCR" value={fmt(k.fcr)} hint={k.fcr === null ? needsFeed : "kg feed per kg gained"} />
          <Kpi label="Daily gain" value={fmt(k.adg, " g")} hint={needsWeight} />
          <Kpi label="EPEF" value={fmt(k.epef)} hint={k.epef === null ? needsFeed : "Above 400 is very good"} />
          <Kpi label="Days logged" value={fmt(batch.totals.days)} hint={`Day ${batch.ageDays} of age`} />
        </dl>
        <TrendChart
          title={`Average weight (kg) of this ${batch.breed} batch against the Ross 308 standard`}
          unit="count"
          height={220}
          data={rows}
          series={[
            { key: "standard", label: "Standard" },
            { key: "actual", label: "Actual", dots: true },
          ]}
        />
      </div>
    </Panel>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-fg-muted">{label}</dt>
      <dd className="num text-xl font-semibold text-fg">{value}</dd>
      <dd className="text-xs text-fg-subtle">{hint}</dd>
    </div>
  );
}
