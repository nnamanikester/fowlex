"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { RailTip } from "./rail-tip";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { type BatchSummary, useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

const STATUS: Record<BatchSummary["status"], { label: string; dot: string }> = {
  planned: { label: "Planned", dot: "bg-info" },
  active: { label: "Growing", dot: "bg-success" },
  selling: { label: "Selling", dot: "bg-warning" },
};

/** A batch's tile: its number (07 from B-2026-07) on charcoal with a comb-red glow. */
export function BatchTile({ code, size = 36 }: { code: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className="grid shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-comb to-charcoal-mid font-bold tabular-nums text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]"
    >
      {code.split("-").pop() ?? "?"}
    </span>
  );
}

const describe = (b: BatchSummary) =>
  b.day < 0
    ? `Arrives in ${-b.day} day${b.day === -1 ? "" : "s"} · ${b.liveBirds.toLocaleString("en-NG")} chicks`
    : `Day ${b.day} · ${b.liveBirds.toLocaleString("en-NG")} birds`;

/** The batch the farm pages look at, how it's doing, and the way to move to another one. */
export function BatchSwitcher({ rail = false }: { rail?: boolean }) {
  const { batches, batch, setBatch, can } = useWorkspace();
  const router = useRouter();
  const card = cn(
    "flex w-full items-center gap-3 rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/[0.08]",
    rail ? "justify-center p-1.5" : "p-2 pr-2.5",
  );

  if (!batch)
    return can("batch.write") ? (
      <Link href="/batches?new=1" className={cn(card, "focus-ring group relative text-nav-fg hover:bg-white/[0.09]")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/10">
          <Plus className="size-4" aria-hidden />
        </span>
        {!rail && <span className="text-sm font-bold">Start your first batch</span>}
        {rail && <RailTip>Start your first batch</RailTip>}
      </Link>
    ) : null;

  const status = STATUS[batch.status];
  return (
    <Menu
      label="Switch batch"
      className={rail ? "w-64" : undefined}
      matchWidth={!rail}
      trigger={({ ref, open, ...props }) => (
        <button
          ref={ref}
          type="button"
          {...props}
          aria-label={`Batch: ${batch.code}. Switch batch`}
          className={cn(
            card,
            "focus-ring group relative transition-colors hover:bg-white/[0.09]",
            open && "bg-white/[0.09]",
          )}
        >
          <BatchTile code={batch.code} />
          {!rail && (
            <>
              <span className="min-w-0 flex-1 text-left leading-tight">
                <span className="block truncate font-mono text-sm font-semibold text-nav-fg">{batch.code}</span>
                <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-nav-muted">
                  <span className={cn("size-1.5 shrink-0 rounded-full", status.dot)} aria-hidden />
                  {describe(batch)}
                </span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-nav-subtle" aria-hidden />
            </>
          )}
          {rail && <RailTip>{batch.code}</RailTip>}
        </button>
      )}
    >
      <MenuLabel>Batches on the farm</MenuLabel>
      {batches.map((b) => (
        <MenuItem
          key={b.id}
          selected={b.id === batch.id}
          onSelect={() => setBatch(b.id)}
          icon={<BatchTile code={b.code} size={22} />}
          hint={
            b.id === batch.id ? (
              <Check className="size-4 text-brand-fg" aria-label="Current batch" />
            ) : (
              STATUS[b.status].label
            )
          }
        >
          <span className="font-mono">{b.code}</span>
        </MenuItem>
      ))}
      {can("batch.write") && (
        <>
          <MenuSeparator />
          <MenuItem icon={<Plus />} onSelect={() => router.push("/batches?new=1")}>
            New batch
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
