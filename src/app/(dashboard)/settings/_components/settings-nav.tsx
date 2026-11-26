"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/users", label: "Users" },
];

/** The settings sections, as tabs under the page title. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="-mt-2 mb-6 flex gap-1 border-b border-line">
      {TABS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring -mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              active ? "border-brand text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
