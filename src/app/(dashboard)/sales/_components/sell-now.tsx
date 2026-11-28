"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote } from "lucide-react";
import { toast } from "sonner";

import { SellNowSheet } from "./sell-now-sheet";
import { Fab } from "@/components/kit";
import { Button } from "@/components/ui/button";
import type { PriceOption } from "@/lib/shop/prices";

/** The Sales page's first action: sell to whoever's in front of you, in one sheet. */
export function SellNow({
  batches,
  prices,
  simulated,
}: {
  batches: { id: string; code: string; free: number; birdGrams?: number }[];
  prices: PriceOption[];
  simulated: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const free = batches.reduce((n, b) => n + b.free, 0);
  const none = !free;
  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-subtle text-brand-fg" aria-hidden>
          <Banknote className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="text-lg font-bold text-fg-heading">Someone buying now?</h2>
          <p className="text-sm text-fg-muted">
            Sell to anyone in one step, no details needed: cash, transfer or pay later.{" "}
            <span className="num font-semibold text-fg">
              {none ? "No birds free to sell." : `${free.toLocaleString("en-NG")} birds free.`}
            </span>
          </p>
        </div>
        <Button disabled={none} reason="There are no birds free to sell." onClick={() => setOpen(true)}>
          <Banknote /> Sell now
        </Button>
      </section>
      {!none && <Fab label="Sell now" icon={<Banknote />} onClick={() => setOpen(true)} />}
      {open && (
        <SellNowSheet
          batches={batches}
          prices={prices}
          simulated={simulated}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
          onDone={(message) => {
            setOpen(false);
            toast.success(message);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
