import Link from "next/link";

import { cn } from "@/lib/utils";

/** The farm's people, and the attendance sheet for those paid by the day. */
export function PeopleTabs({ current }: { current: "people" | "attendance" }) {
  return (
    <nav aria-label="People sections" className="-mx-4 flex gap-1 border-b border-line px-4 md:mx-0 md:px-0">
      {(
        [
          ["people", "People", "/people"],
          ["attendance", "Attendance", "/people/attendance"],
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
