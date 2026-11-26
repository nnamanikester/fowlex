import type { Metadata } from "next";
import Image from "next/image";

import { ThemeToggle } from "@/components/kit/theme-toggle";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Design system" };

/** Every token in the current theme. Components join this page as they are added (step 1.3). */
export default function DesignPage() {
  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="font-mono text-xs uppercase tracking-widest text-comb-fg">Fowlex</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-fg-heading">Design system</h1>
          <p className="max-w-prose text-[15px] leading-6 text-fg-muted">
            Tokens live in <code>globals.css</code>, rules in <code>DESIGN.md</code>. Switch the theme to check both.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Brand">
        <div className="flex flex-wrap items-center gap-6">
          <Image
            src="/brand/fowlex-logo-horizontal-color.svg"
            alt="Fowlex"
            width={240}
            height={85}
            loading="eager"
            className="dark:hidden"
          />
          <Image
            src="/brand/fowlex-logo-horizontal-reverse.svg"
            alt=""
            width={240}
            height={85}
            loading="eager"
            className="hidden dark:block"
          />
          <Image src="/brand/fowlex-icon-color.svg" alt="Fowlex icon" width={72} height={72} className="dark:hidden" />
          <Image src="/brand/fowlex-icon-reverse.svg" alt="" width={72} height={72} className="hidden dark:block" />
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
      </Section>

      <Section title="Surfaces and lines">
        <Swatches
          items={[
            ["canvas", "bg-canvas", "The page"],
            ["surface", "bg-surface", "Cards, inputs"],
            ["surface-raised", "bg-surface-raised", "Menus, dialogs"],
            ["surface-subtle", "bg-surface-subtle", "Hover, table header"],
            ["surface-muted", "bg-surface-muted", "Selected, skeletons"],
            ["line", "bg-line", "Dividers"],
            ["line-strong", "bg-line-strong", "Input borders"],
          ]}
        />
      </Section>

      <Section title="Text">
        <div className="grid gap-2 rounded-xl border bg-surface p-5 shadow-card">
          <p className="font-display text-xl font-bold text-fg-heading">fg-heading: Batch B-2026-07</p>
          <p className="text-fg">fg: 1,000 birds placed on 3 Nov, 785 alive today.</p>
          <p className="text-fg-muted">fg-muted: Starter feed, 25 kg bags</p>
          <p className="text-xs text-fg-subtle">fg-subtle: Logged by Musa · 2 hours ago</p>
          <p>
            <a href="#" className="focus-ring rounded font-semibold text-brand-fg underline-offset-4 hover:underline">
              brand-fg: View invoice
            </a>
          </p>
        </div>
      </Section>

      <Section title="Actions">
        <div className="flex flex-wrap items-center gap-3">
          <button className="focus-ring min-h-11 rounded-xl bg-brand-solid px-5 font-semibold text-brand-ink shadow-button transition-colors hover:bg-brand-solid-hover">
            Record expense
          </button>
          <button className="focus-ring min-h-11 rounded-xl border border-line-strong bg-surface px-5 font-semibold text-fg shadow-button hover:bg-surface-subtle">
            Export CSV
          </button>
          <button className="focus-ring min-h-11 rounded-xl bg-danger px-5 font-semibold text-white shadow-button">
            Delete batch
          </button>
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-brand-subtle text-brand">
            ●
          </span>
        </div>
        <p className="text-xs text-fg-subtle">
          Final buttons come with the component library in step 1.3. These show the colours only.
        </p>
      </Section>

      <Section title="Status">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["success", "Profit", "bg-success", "bg-success-subtle text-success-fg border-success-line"],
              ["warning", "Low stock", "bg-warning", "bg-warning-subtle text-warning-fg border-warning-line"],
              ["danger", "Overdue", "bg-danger", "bg-danger-subtle text-danger-fg border-danger-line"],
              ["info", "Vaccination due", "bg-info", "bg-info-subtle text-info-fg border-info-line"],
            ] as const
          ).map(([name, label, solid, tint]) => (
            <div key={name} className={cn("flex items-center gap-3 rounded-xl border px-4 py-3", tint)}>
              <span className={cn("size-2.5 rounded-full", solid)} />
              <span className="font-semibold">{label}</span>
              <span className="ml-auto font-mono text-xs opacity-80">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Sidebar">
        <nav className="grid max-w-xs gap-1 rounded-xl bg-nav p-3 text-sm">
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

      <Section title="Type">
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

      <Section title="Shadows and radius">
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
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4" aria-labelledby={`s-${title}`}>
      <h2 id={`s-${title}`} className="text-lg font-bold text-fg-heading">
        {title}
      </h2>
      {children}
    </section>
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
