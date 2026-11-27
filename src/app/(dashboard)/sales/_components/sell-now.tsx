"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote } from "lucide-react";
import { toast } from "sonner";

import { SellNowSheet } from "./sell-now-sheet";
import { Fab } from "@/components/kit";
import { Button } from "@/components/ui/button";

/** The Sales page's first action: sell to whoever's in front of you, in one sheet. */
export function SellNow({
  batches,
  pricePerKgKobo,
  simulated,
}: {
  batches: { id: string; code: string; free: number }[];
  pricePerKgKobo: number | null;
  simulated: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const none = !batches.length;
  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">Someone buying now?</p>
          <p className="text-sm text-fg-muted">
            Sell to anyone in one step: no details needed. Paid in cash, by transfer to an account made for the sale, or
            later.
          </p>
        </div>
        <Button
          size="lg"
          disabled={none}
          reason="There are no birds free to sell."
          onClick={() => setOpen(true)}
          className="sm:w-auto"
        >
          <Banknote /> Sell now
        </Button>
      </div>
      {!none && <Fab label="Sell now" icon={<Banknote />} onClick={() => setOpen(true)} />}
      {open && (
        <SellNowSheet
          batches={batches}
          pricePerKgKobo={pricePerKgKobo}
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
