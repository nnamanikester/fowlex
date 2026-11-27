import Link from "next/link";

import { cn } from "@/lib/utils";

/** Expenses, and the categories and budgets they're counted against. */
export function ExpensesTabs({ current }: { current: "expenses" | "categories" }) {
  return (
    <nav aria-label="Expenses sections" className="-mx-4 mb-4 flex gap-1 border-b border-line px-4 md:mx-0 md:px-0">
      {(
        [
          ["expenses", "Expenses", "/expenses"],
          ["categories", "Categories and budgets", "/expenses/categories"],
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
