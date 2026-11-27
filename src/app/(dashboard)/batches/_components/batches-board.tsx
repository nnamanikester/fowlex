"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bird, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { BatchSheet } from "./batch-sheet";
import { EmptyState, Fab, Panel } from "@/components/kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatAge, type Phase, PHASE_LABELS } from "@/lib/batches/rules";
import type { BatchView } from "@/lib/batches/service";
import { formatRange } from "@/lib/dates";
import type { HouseView } from "@/lib/houses/service";
import { cn } from "@/lib/utils";

export const PHASE_TONE: Record<Phase, BadgeTone> = {
  planned: "info",
  active: "success",
  selling: "warning",
  closed: "neutral",
};

type Filter = "farm" | "closed" | "all";
const n = (x: number) => x.toLocaleString("en-NG");

/** Every batch as a card, filtered to the ones on the farm by default. New batches open in a sheet. */
export function BatchesBoard({
  batches,
  houses,
  today,
  canWrite,
  canManageHouses,
  hatcheries = [],
}: {
  batches: BatchView[];
  houses: HouseView[];
  today: string;
  canWrite: boolean;
  canManageHouses: boolean;
  hatcheries?: { id: string; name: string; chicks: boolean }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = React.useState<Filter>("farm");
  const [query, setQuery] = React.useState("");
  const creating = canWrite && params.get("new") === "1";

  const setCreating = (open: boolean) => router.replace(open ? `${pathname}?new=1` : pathname, { scroll: false });

  const onFarm = batches.filter((b) => b.phase !== "closed");
  const closed = batches.filter((b) => b.phase === "closed");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (filter === "farm" ? onFarm : filter === "closed" ? closed : batches)
    .filter((b) => words.every((w) => `${b.code} ${b.houseName} ${b.breed}`.toLowerCase().includes(w)))
    // Planned first (soonest arrival), then the youngest birds.
    .sort((a, b) => Number(b.phase === "planned") - Number(a.phase === "planned") || a.ageDays - b.ageDays);

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="hidden justify-end lg:-mt-14 lg:mb-6 lg:flex">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New batch
          </Button>
        </div>
      )}

      {batches.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Segmented
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "farm", label: `On the farm (${onFarm.length})` },
              { value: "closed", label: `Closed (${closed.length})` },
              { value: "all", label: "All" },
            ]}
          />
          <label className="relative flex-1 sm:max-w-xs">
            <span className="sr-only">Search batches</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Code, house or breed"
              className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-[16px] text-fg shadow-button placeholder:text-fg-subtle focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 sm:h-9 sm:text-sm"
            />
          </label>
        </div>
      )}

      {batches.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Bird />}
            title="No batches yet"
            description="A batch is one group of chicks placed in a house, followed until sale."
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus /> Start your first batch
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-muted">
          {words.length ? <>Nothing matches &ldquo;{query}&rdquo;.</> : "No batches here."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((b) => (
            <li key={b.id}>
              <BatchCard batch={b} />
            </li>
          ))}
        </ul>
      )}

      {canWrite && <Fab label="New batch" icon={<Plus />} onClick={() => setCreating(true)} />}

      <BatchSheet
        open={creating}
        onClose={() => setCreating(false)}
        houses={houses}
        today={today}
        canManageHouses={canManageHouses}
        hatcheries={hatcheries}
        onSaved={(batch) => {
          toast.success(`${batch.code} placed: ${n(batch.placed)} birds in ${batch.houseName}.`);
          router.replace(pathname, { scroll: false });
          router.refresh();
        }}
      />
    </div>
  );
}

function BatchCard({ batch: b }: { batch: BatchView }) {
  const progress = Math.max(0, Math.min(1, b.ageDays / b.targetSellAgeDays));
  const daysLeft = b.targetSellAgeDays - b.ageDays;
  return (
    <Link
      href={`/batches/${b.id}`}
      className="focus-ring flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong active:bg-surface-subtle"
    >
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block font-mono text-base font-semibold text-fg-heading">{b.code}</span>
          <span className="text-xs text-fg-subtle">
            {b.houseName} · {b.breed}
          </span>
        </span>
        <Badge tone={PHASE_TONE[b.phase]}>{PHASE_LABELS[b.phase]}</Badge>
      </span>

      {b.phase === "planned" ? (
        <span className="text-sm text-fg">
          Arrives {formatRange({ from: b.placedOn, to: b.placedOn })} ·{" "}
          <span className="num font-semibold">{n(b.placed)}</span> chicks
        </span>
      ) : (
        <span className="flex items-end justify-between gap-3">
          <span>
            <span className="block text-2xl font-semibold text-fg">{formatAge(b.ageDays).split(" · ")[0]}</span>
            <span className="text-xs text-fg-subtle">{formatAge(b.ageDays).split(" · ")[1]}</span>
          </span>
          <span className="text-right">
            <span className="num block text-lg font-semibold text-fg">{n(b.liveBirds)}</span>
            <span className="text-xs text-fg-subtle">birds</span>
          </span>
        </span>
      )}

      {b.phase !== "planned" && b.phase !== "closed" && (
        <span className="space-y-1">
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <span
              className={cn("block h-full rounded-full", daysLeft <= 0 ? "bg-warning" : "bg-brand")}
              style={{ width: `${progress * 100}%` }}
            />
          </span>
          <span className="block text-xs text-fg-muted">
            {daysLeft > 0
              ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} to target (${b.targetSellAgeDays} days)`
              : `Target age reached${daysLeft < 0 ? ` ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago` : " today"}`}
          </span>
        </span>
      )}
      {b.phase === "closed" && b.closedOn && (
        <span className="text-xs text-fg-subtle">Closed {formatRange({ from: b.closedOn, to: b.closedOn })}</span>
      )}
    </Link>
  );
}
