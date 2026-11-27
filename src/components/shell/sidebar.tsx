"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { AccountMenu } from "./account-menu";
import { BatchSwitcher } from "./batch-switcher";
import { isActive, navFor } from "./nav";
import { RailTip } from "./rail-tip";
import { useModKey, useShell } from "./shell-context";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

/**
 * The charcoal sidebar: the logo, the batch you're looking at, search, the pages with a light
 * comb-red marker that slides to the one you're on, and you. `rail` folds it to icons with labels
 * on hover; the drawer on phones shows it in full.
 */
export function Sidebar({ rail = false }: { rail?: boolean }) {
  const pathname = usePathname();
  const { me, badges } = useWorkspace();
  const { openPalette } = useShell();
  const mod = useModKey();
  const groups = navFor(me.role);

  // The marker slides from the old page to the new one: measured, then moved with a transform.
  const navRef = React.useRef<HTMLElement>(null);
  const [marker, setMarker] = React.useState<{ top: number; height: number } | null>(null);
  React.useLayoutEffect(() => {
    const nav = navRef.current;
    const place = () => {
      const active = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
      setMarker(active ? { top: active.offsetTop, height: active.offsetHeight } : null);
    };
    place();
    // Re-measure whenever the list's layout moves: fonts arriving, the rail folding, a resize.
    const observer = new ResizeObserver(place);
    if (nav) observer.observe(nav);
    void document.fonts?.ready.then(place);
    return () => observer.disconnect();
  }, [pathname, rail, groups.length]);

  return (
    <div className={cn("relative flex h-full flex-col bg-nav text-nav-muted", !rail && "overflow-hidden")}>
      {/* A comb-red glow from the top corner, as on the sign-in panel, in its own clipped layer so
          the rail's labels can still reach past the edge. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-32 size-80 rounded-full bg-comb/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 size-80 rounded-full bg-charcoal-mid/80 blur-3xl" />
      </div>

      <div className={cn("relative flex h-16 shrink-0 items-center", rail ? "justify-center" : "pl-5 pr-3")}>
        <Link href="/" prefetch={false} className="focus-ring rounded-md" aria-label="Fowlex overview">
          {rail ? (
            <Image src="/brand/fowlex-icon-reverse.svg" alt="" width={34} height={34} />
          ) : (
            <Image
              src="/brand/fowlex-logo-horizontal-reverse.svg"
              alt="Fowlex"
              width={113}
              height={40}
              loading="eager"
            />
          )}
        </Link>
      </div>

      <div className={cn("relative space-y-2", rail ? "px-3" : "px-3.5")}>
        <BatchSwitcher rail={rail} />
        <button
          type="button"
          onClick={openPalette}
          aria-label="Search or jump to"
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(
            "focus-ring group flex h-10 w-full items-center gap-2.5 rounded-xl text-sm text-nav-subtle ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/[0.05] hover:text-nav-muted",
            rail ? "justify-center" : "px-3",
          )}
        >
          <Search className="size-4 shrink-0" aria-hidden />
          {!rail && (
            <>
              <span className="flex-1 text-left">Search or jump to…</span>
              <kbd className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-sans text-[11px] font-semibold text-nav-muted">
                {mod} K
              </kbd>
            </>
          )}
        </button>
      </div>

      <nav
        ref={navRef}
        aria-label="Pages"
        className={cn("relative mt-5 flex-1 space-y-6", rail ? "overflow-visible px-3" : "overflow-y-auto px-3.5")}
      >
        {marker && (
          // The highlight itself slides to the page you open: a soft pill with a lit comb-red edge.
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 rounded-xl bg-white/[0.08] ring-1 ring-inset ring-white/[0.06] transition-[transform,height] duration-300 ease-out",
              rail ? "inset-x-3" : "inset-x-3.5",
            )}
            style={{ transform: `translateY(${marker.top}px)`, height: marker.height }}
          >
            <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-nav-accent shadow-[0_0_10px_rgb(var(--nav-accent)/0.8)]" />
          </span>
        )}
        {groups.map((group) => (
          <div key={group.title}>
            {rail ? (
              <div className="mx-2 mb-2 h-px bg-white/[0.08]" aria-hidden />
            ) : (
              <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-nav-subtle">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, key }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      aria-label={badgeLabel(label, badges[href])}
                      aria-keyshortcuts={`G ${key.toUpperCase()}`}
                      className={cn(
                        "focus-ring group relative flex h-10 items-center gap-3 rounded-xl text-sm font-semibold transition-colors duration-150",
                        rail ? "justify-center" : "px-3",
                        active ? "text-nav-fg" : "hover:bg-white/[0.04] hover:text-nav-fg",
                      )}
                    >
                      <Icon
                        className={cn("size-[18px] shrink-0 transition-colors", active ? "text-nav-accent" : "")}
                        aria-hidden
                      />
                      {rail ? (
                        <span className="sr-only">{label}</span>
                      ) : (
                        <>
                          <span className="flex-1 truncate">{label}</span>
                          {badges[href] ? <NavBadge count={badges[href]} /> : null}
                          <span
                            aria-hidden
                            className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          >
                            <Key>G</Key>
                            <Key>{key.toUpperCase()}</Key>
                          </span>
                        </>
                      )}
                      {rail && badges[href] ? (
                        <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-warning" />
                      ) : null}
                      {rail && <RailTip>{label}</RailTip>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("relative space-y-2 pb-3 pt-4", rail ? "px-3" : "px-3.5")}>
        <div className="border-t border-white/[0.08] pt-2">
          <AccountMenu rail={rail} />
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="grid h-5 min-w-5 place-items-center rounded bg-white/[0.08] px-1 font-sans text-[10px] font-bold text-nav-subtle">
      {children}
    </kbd>
  );
}

/** "Inventory, 3 need attention": a nav item's name when it has a badge. */
export const badgeLabel = (label: string, count: number | undefined) =>
  count ? `${label}, ${count} need attention` : undefined;

/** How many need attention, on a nav item: low stock, say. Its link carries the words (`badgeLabel`). */
export function NavBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "num grid h-5 min-w-5 place-items-center rounded-full bg-warning px-1.5 text-[11px] font-bold text-fg-inverse",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
