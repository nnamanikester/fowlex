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
  batches: { id: string; code: string; free: number }[];
  prices: PriceOption[];
  simulated: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const free = batches.reduce((n, b) => n + b.free, 0);
  const none = !free;
  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-charcoal p-5 text-white shadow-card sm:p-6">
        {/* A soft comb-red glow: the brand, once, behind the page's main action. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-[rgb(var(--comb))] opacity-25 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold">Someone buying now?</h2>
            <p className="mt-1 max-w-md text-sm text-white/70">
              Sell to anyone in one step, no details needed. Cash, transfer or pay later.
            </p>
            <p className="num mt-3 text-sm font-semibold text-[rgb(var(--comb-on-dark))]">
              {none ? "No birds free to sell" : `${free.toLocaleString("en-NG")} birds free to sell`}
            </p>
          </div>
          <Button
            size="lg"
            disabled={none}
            reason="There are no birds free to sell."
            onClick={() => setOpen(true)}
            className="bg-white text-charcoal shadow-pop hover:bg-white/90 sm:w-auto sm:px-8"
          >
            <Banknote /> Sell now
          </Button>
        </div>
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
