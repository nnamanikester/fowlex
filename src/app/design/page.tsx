import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { DataShowcase } from "./_components/data-showcase";
import { Section, Showcase } from "./_components/showcase";
import { PageHeader, ThemeToggle } from "@/components/kit";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Design system" };

const SECTIONS = [
  ["brand", "Brand"],
  ["colour", "Colour"],
  ["type", "Type"],
  ["shape", "Shadows and radius"],
  ["buttons", "Buttons"],
  ["status", "Status"],
  ["forms", "Forms"],
  ["data", "Data"],
  ["overlays", "Overlays and feedback"],
  ["tables", "Tables and inputs"],
  ["charts", "Charts"],
] as const;

/**
 * The design system, live: every token and component in the current theme. The reference for
 * building pages (with DESIGN.md), and what a reviewer opens on a Vercel preview.
 */
export default function DesignPage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-header max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" prefetch={false} className="focus-ring rounded-lg">
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
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl gap-12 px-4 py-10 sm:px-6">
        <nav aria-label="Sections" className="sticky top-24 hidden h-fit w-44 shrink-0 lg:block">
          <ul className="space-y-0.5 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="focus-ring block rounded-lg px-3 py-2 font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1">
          <PageHeader
            title="Design system"
            description="Every part the Fowlex dashboard is built from. Tokens live in globals.css, rules in DESIGN.md. Switch the theme to check both."
          />
          <div className="space-y-12">
            <Tokens />
            <Showcase />
            <DataShowcase />
          </div>
        </main>
      </div>
    </div>
  );
}

function Tokens() {
  return (
    <>
      <Section id="brand" title="Brand">
        <div className="flex flex-wrap items-center gap-6">
          <Image
            src="/brand/fowlex-logo-horizontal-color.svg"
            alt="Fowlex logo"
            width={240}
            height={85}
            className="dark:hidden"
          />
          <Image
            src="/brand/fowlex-logo-horizontal-reverse.svg"
            alt="Fowlex logo"
            width={240}
            height={85}
            className="hidden dark:block"
          />
          <Image src="/brand/fowlex-icon-color.svg" alt="Fowlex icon" width={72} height={72} className="dark:hidden" />
          <Image
            src="/brand/fowlex-icon-reverse.svg"
            alt="Fowlex icon"
            width={72}
            height={72}
            className="hidden dark:block"
          />
        </div>
        <Swatches
          items={[
            ["comb", "bg-comb", "Identity: logo, selected page edge"],
            ["comb-subtle", "bg-comb-subtle", "Brand tint"],
            ["charcoal", "bg-charcoal", "Auth panel"],
            ["charcoal-mid", "bg-charcoal-mid", "Auth panel gradient"],
          ]}
        />
        <div className="h-28 rounded-xl bg-gradient-to-br from-charcoal via-charcoal-mid to-comb p-5">
          <p className="font-display text-2xl font-bold text-white">The auth brand panel</p>
          <p className="text-sm text-white/75">from-charcoal via-charcoal-mid to-comb</p>
        </div>
        <nav aria-label="Sidebar sample" className="grid max-w-xs gap-1 rounded-xl bg-nav p-3 text-sm">
          <p className="px-3 pb-1 text-2xs font-semibold uppercase tracking-wider text-nav-subtle">Farm</p>
          <span className="relative rounded-lg bg-white/[0.07] px-3 py-2 font-semibold text-nav-accent">
            <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-comb" />
            Batches
          </span>
          <span className="rounded-lg px-3 py-2 text-nav-muted">Inventory</span>
          <span className="rounded-lg px-3 py-2 text-nav-muted">Expenses</span>
          <span className="rounded-lg px-3 py-2 text-nav-fg">nav-fg: Musa Bello</span>
        </nav>
      </Section>

      <Section id="colour" title="Colour">
        <Swatches
          items={[
            ["canvas", "bg-canvas", "The page"],
            ["surface", "bg-surface", "Cards, inputs"],
            ["surface-raised", "bg-surface-raised", "Menus, dialogs"],
            ["surface-subtle", "bg-surface-subtle", "Hover, table header"],
            ["surface-muted", "bg-surface-muted", "Selected, skeletons"],
            ["line", "bg-line", "Dividers"],
            ["line-strong", "bg-line-strong", "Input borders"],
            ["brand", "bg-brand", "Focus, icons, selected"],
            ["brand-solid", "bg-brand-solid", "Primary buttons"],
            ["brand-subtle", "bg-brand-subtle", "Icon tiles, tints"],
            ["success", "bg-success", "Profit, paid"],
            ["warning", "bg-warning", "Low stock, test mode"],
            ["danger", "bg-danger", "Loss, overdue, delete"],
            ["info", "bg-info", "Scheduled: vaccinations"],
          ]}
        />
        <div className="grid gap-2 rounded-xl border bg-surface p-5 shadow-card">
          <p className="font-display text-xl font-bold text-fg-heading">fg-heading: Batch B-2026-07</p>
          <p className="text-fg">fg: 1,000 birds placed on 3 Nov, 785 alive today.</p>
          <p className="text-fg-muted">fg-muted: Starter feed, 25 kg bags</p>
          <p className="text-xs text-fg-subtle">fg-subtle: Logged by Musa · 2 hours ago</p>
          <p>
            <a
              href="#colour"
              className="focus-ring rounded font-semibold text-brand-fg underline-offset-4 hover:underline"
            >
              brand-fg: View invoice
            </a>
          </p>
        </div>
      </Section>

      <Section id="type" title="Type">
        <div className="grid gap-3 rounded-xl border bg-surface p-5 shadow-card">
          <p className="font-display text-[2.5rem] font-bold leading-tight tracking-tight text-fg-heading">
            Display, Jost
          </p>
          <p className="font-display text-2xl font-bold tracking-tight text-fg-heading">Page title</p>
          <p className="text-lg font-bold text-fg-heading">Section title</p>
          <p className="text-[15px] leading-6 text-fg-muted">Reading text for descriptions and empty states.</p>
          <p className="num text-2xl font-semibold text-fg">₦1,234,567.00 · ₦98,450.50 · ₦7,000.00</p>
          <p className="font-mono text-sm text-fg">INV-2026-0001 · B-2026-07 · PAY-SUP-6612</p>
        </div>
      </Section>

      <Section id="shape" title="Shadows and radius">
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["shadow-card · rounded-xl", "shadow-card rounded-xl"],
              ["shadow-button · rounded-lg", "shadow-button rounded-lg"],
              ["shadow-pop · rounded-2xl", "shadow-pop rounded-2xl"],
            ] as const
          ).map(([label, cls]) => (
            <div key={label} className={cn("grid h-24 w-48 place-items-center border bg-surface text-xs", cls)}>
              {label}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function Swatches({ items }: { items: [name: string, cls: string, use: string][] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([name, cls, use]) => (
        <div key={name} className="overflow-hidden rounded-xl border bg-surface shadow-card">
          <div className={cn("h-14 border-b", cls)} />
          <div className="grid gap-0.5 p-2.5">
            <code className="text-xs font-medium text-fg">{name}</code>
            <span className="text-2xs text-fg-subtle">{use}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
