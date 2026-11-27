"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The page's main action on phones: a round button in thumb's reach, above the tab bar, clear of
 * the home indicator. Hidden from 1024px, where the page header shows the same action.
 */
export function Fab({
  label,
  icon,
  href,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "focus-ring fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-brand-solid pl-4 pr-5 text-[15px] font-semibold text-brand-ink shadow-pop transition-transform active:scale-95 lg:hidden [&_svg]:size-5",
  );
  return href ? (
    <Link href={href} className={className}>
      {icon}
      {label}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  );
}
