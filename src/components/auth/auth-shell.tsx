import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Bird, ChartLine, ReceiptText } from "lucide-react";

import { ThemeToggle } from "@/components/kit/theme-toggle";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Bird, title: "Every batch, day by day", body: "Deaths, feed and weight logged from a phone" },
  { icon: ReceiptText, title: "Invoices paid by Paystack", body: "Customers pay by link; you see it at once" },
  { icon: ChartLine, title: "Profit per batch", body: "Every cost counted, and a forecast of what's next" },
];

/**
 * Every sign-in page: the brand panel on the left from 1024px, the form column on the right (with
 * the logo on top on smaller screens). The form sits at a fixed height from the top, so moving
 * between steps never makes the page jump.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside
        aria-hidden
        className="relative hidden flex-col justify-between gap-10 overflow-hidden bg-gradient-to-br from-charcoal via-charcoal-mid to-comb p-10 text-white lg:flex xl:p-14"
      >
        <Image src="/brand/fowlex-logo-horizontal-reverse.svg" alt="" width={136} height={48} />
        <div className="relative max-w-[30rem] space-y-9">
          <div className="space-y-3">
            <h2 className="text-balance text-[2.5rem] font-bold leading-[1.05] tracking-tight">
              Your farm, in one place.
            </h2>
            <p className="max-w-sm text-base leading-7 text-white/75">
              Birds, feed, money and people: what Fowlex Farms has, spends and earns.
            </p>
          </div>
          <ul className="space-y-4 text-sm">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">
                  <Icon className="size-[17px]" />
                </span>
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="text-white/70">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">Fowlex Farms</p>
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/10 blur-3xl" />
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex h-header shrink-0 items-center px-5 sm:px-10 lg:invisible">
          <Image
            src="/brand/fowlex-logo-horizontal-color.svg"
            alt="Fowlex"
            width={113}
            height={40}
            loading="eager"
            className="dark:hidden"
          />
          <Image
            src="/brand/fowlex-logo-horizontal-reverse.svg"
            alt="Fowlex"
            width={113}
            height={40}
            loading="eager"
            className="hidden dark:block"
          />
        </header>
        <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-8 sm:px-10 sm:pt-[max(2.5rem,11vh)]">
          <div className="w-full max-w-[25rem] animate-slide-up">{children}</div>
        </main>
        <footer className="flex items-center justify-between gap-3 px-5 py-5 text-xs text-fg-subtle sm:px-10">
          <span>Fowlex Farms</span>
          <ThemeToggle />
        </footer>
      </div>
    </div>
  );
}

/** Title and one line of context, the top of every sign-in form. */
export function AuthHeading({
  title,
  description,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7", className)}>
      <h1 className="text-balance text-[1.75rem] font-bold leading-tight tracking-tight text-fg-heading">{title}</h1>
      {description && <p className="mt-2 text-[15px] leading-6 text-fg-muted">{description}</p>}
    </div>
  );
}

/** A quiet link under a form ("Back to sign in"). */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="focus-ring rounded-sm font-semibold text-brand-fg hover:underline">
      {children}
    </Link>
  );
}
