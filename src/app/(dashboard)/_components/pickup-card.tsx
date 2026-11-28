import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";

import { Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import type { BatchView } from "@/lib/batches/service";

/** Booked chicks to collect, soonest first, each a tap from "Chicks picked up". Nothing when none. */
export function PickupCard({ batches, today }: { batches: BatchView[]; today: string }) {
  if (!batches.length) return null;
  const when = (d: string) =>
    d === today
      ? "Today"
      : d < today
        ? "Overdue"
        : new Intl.DateTimeFormat("en-NG", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          }).format(new Date(`${d}T00:00:00Z`));
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <CalendarClock className="size-4 text-info-fg" aria-hidden /> Chicks to pick up
        </span>
      }
      description="Booked and paid for. Tap one when you collect it."
      flush
    >
      <ul className="divide-y divide-line">
        {batches.map((b) => (
          <li key={b.id}>
            <Link
              href={`/batches?pickup=${b.id}`}
              className="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle"
            >
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block font-semibold text-fg">
                  {(b.bookedChicks ?? b.placed).toLocaleString("en-NG")} chicks
                  {b.supplierName ? ` from ${b.supplierName}` : ""}
                </span>
                <span className="block text-xs text-fg-muted">
                  {b.code} → {b.houseName}
                </span>
              </span>
              <Badge tone={b.placedOn <= today ? "warning" : "info"}>{when(b.placedOn)}</Badge>
              <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
