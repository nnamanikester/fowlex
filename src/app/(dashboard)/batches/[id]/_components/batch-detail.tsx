"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardPen, Hammer, MoreHorizontal, Pencil, ShoppingCart, Sprout, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BatchSheet } from "../../_components/batch-sheet";
import { PHASE_TONE } from "../../_components/batches-board";
import { ConfirmDialog, EmptyState, Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { ageOn, formatAge, PHASE_LABELS, targetDate } from "@/lib/batches/rules";
import type { BatchView } from "@/lib/batches/service";
import { formatRange } from "@/lib/dates";
import type { HouseView } from "@/lib/houses/service";
import { bags } from "@/lib/logs/rules";
import type { LogView } from "@/lib/logs/service";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

const TABS = [
  ["overview", "Overview", null],
  ["logs", "Daily logs", null],
  ["health", "Health", "2.5"],
  ["costs", "Costs", "8.1"],
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
  today,
  tab,
  canWrite,
  canLog,
  canManageHouses,
}: {
  batch: BatchView;
  houses: HouseView[];
  logs: LogView[];
  canLog: boolean;
  today: string;
  tab: Tab;
  canWrite: boolean;
  canManageHouses: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const open = b.phase !== "closed";

  const setStatus = async (status: "active" | "selling") => {
    try {
      await apiRequest(`/api/batches/${b.id}/status`, "POST", { status });
      toast.success(status === "selling" ? `${b.code} is now selling.` : `${b.code} is back to growing.`);
      router.refresh();
    } catch (e) {
      toast.error((e as AuthError).message);
    }
  };

  const daysLeft = b.targetSellAgeDays - b.ageDays;

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
          {canWrite && open && (
            <Menu
              label={`${b.code} actions`}
              align="end"
              trigger={({ ref, ...props }) => (
                <Button ref={ref} variant="secondary" size="icon" aria-label={`${b.code} actions`} {...props}>
                  <MoreHorizontal />
                </Button>
              )}
            >
              <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
                Edit batch
              </MenuItem>
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
              <MenuSeparator />
              <MenuItem icon={<Trash2 />} tone="danger" onSelect={() => setDeleting(true)}>
                Delete batch
              </MenuItem>
            </Menu>
          )}
        </div>
      </div>

      <nav
        aria-label="Batch sections"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] md:mx-0 md:px-0"
      >
        {TABS.map(([id, label]) => (
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

      {tab === "overview" ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Live birds" value={n(b.liveBirds)} hint={`of ${n(b.placed)} placed`} />
            <StatCard
              label="Age"
              value={b.phase === "planned" ? "Not placed" : formatAge(b.ageDays).split(" · ")[0]}
              hint={b.phase === "planned" ? `Arrives ${day(b.placedOn)}` : formatAge(b.ageDays).split(" · ")[1]}
            />
            <StatCard label="Mortality" value="0.0%" hint="Daily logs start in step 2.3" />
            <StatCard
              label="To target"
              value={
                b.phase === "planned" ? `${b.targetSellAgeDays} days` : daysLeft > 0 ? `${daysLeft} days` : "Reached"
              }
              hint={`${(b.targetWeightGrams / 1000).toFixed(1)} kg by ${day(targetDate(b))}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Placement">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Fact label="Placed on" value={day(b.placedOn)} />
                <Fact label="House" value={b.houseName} />
                <Fact label="Chicks delivered" value={n(b.delivered)} />
                <Fact label="Dead on arrival" value={n(b.deadOnArrival)} />
                <Fact label="Free extras" value={n(b.freeExtras)} />
                <Fact label="Placed alive" value={n(b.placed)} />
                <Fact label="Price per chick" value={formatNaira(b.pricePerChickKobo)} />
                <Fact label={`Chicks cost (${n(b.paid)} paid)`} value={formatNaira(b.chickCostKobo)} />
                <Fact label="Hatchery" value={b.supplierName || "–"} />
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
          onSaved={(saved) => {
            setEditing(false);
            toast.success(`${saved.code} saved.`);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${b.code}?`}
        description="It leaves your batches and reports. It stays in the audit log."
        confirmLabel="Delete batch"
        typeToConfirm={b.code}
        onConfirm={async () => {
          try {
            await apiRequest(`/api/batches/${b.id}`, "DELETE");
            toast.success(`${b.code} deleted.`);
            router.replace("/batches");
            router.refresh();
          } catch (e) {
            toast.error((e as AuthError).message);
          }
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
