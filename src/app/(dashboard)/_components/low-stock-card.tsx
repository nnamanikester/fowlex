import Link from "next/link";
import { ChevronRight, PackageX } from "lucide-react";

import { Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import type { ItemView } from "@/lib/inventory/items";
import { quantity } from "@/lib/inventory/rules";

/** Items at or under their reorder level, each a tap away from buying more. Nothing when none are. */
export function LowStockCard({ items }: { items: ItemView[] }) {
  if (!items.length) return null;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <PackageX className="size-4 text-warning-fg" aria-hidden /> Running low
        </span>
      }
      description="At or under their reorder level. Tap one to buy more."
      flush
    >
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id}>
            <Link
              href={`/inventory/${i.id}?buy=1`}
              className="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-fg">{i.name}</span>
                <span className="block text-xs text-fg-muted">Reorder below {quantity(i.reorderLevel!, i.unit)}</span>
              </span>
              <Badge tone={i.onHand <= 0 ? "danger" : "warning"}>
                {i.onHand <= 0 ? "Out" : `${quantity(i.onHand, i.unit)} left`}
              </Badge>
              <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
