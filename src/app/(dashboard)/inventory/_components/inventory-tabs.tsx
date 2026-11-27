import Link from "next/link";

import { cn } from "@/lib/utils";

/** Stock (used up) and equipment (lasts years), side by side under Inventory. */
export function InventoryTabs({ current }: { current: "stock" | "equipment" }) {
  return (
    <nav aria-label="Inventory sections" className="-mx-4 flex gap-1 border-b border-line px-4 md:mx-0 md:px-0">
      {(
        [
          ["stock", "Stock", "/inventory"],
          ["equipment", "Equipment", "/inventory/equipment"],
        ] as const
      ).map(([id, label, href]) => (
        <Link
          key={id}
          href={href}
          aria-current={current === id ? "page" : undefined}
          className={cn(
            "focus-ring -mb-px border-b-2 px-3 py-2.5 text-sm font-semibold",
            current === id ? "border-brand text-fg" : "border-transparent text-fg-muted hover:text-fg",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
