"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Menu as MenuIcon, Search, X } from "lucide-react";

import { CommandPalette } from "./command-palette";
import { isActive, navFor, pageFor } from "./nav";
import { ShellContext, useModKey } from "./shell-context";
import { Sidebar } from "./sidebar";
import { useStored } from "@/lib/use-stored";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "fowlex_nav_collapsed";

/**
 * The signed-in frame. From lg: the charcoal sidebar (foldable to a rail with `[`) beside the page,
 * under a header with where you are and the page's actions. Below lg: a slim header and a tab bar
 * along the bottom, with the full sidebar a tap away. ⌘K searches everything; G then a letter
 * jumps to a page. `banner` sits above everything (the Paystack test-mode bar).
 */
export function DashboardShell({
  banner,
  headerActions,
  children,
}: {
  banner?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = React.useState(false);
  const [palette, setPalette] = React.useState(false);
  const [stored, setStored] = useStored(COLLAPSED_KEY, "0");
  const collapsed = stored === "1";
  const toggleCollapsed = React.useCallback(() => setStored(collapsed ? "0" : "1"), [collapsed, setStored]);
  const openPalette = React.useCallback(() => {
    setDrawer(false);
    setPalette(true);
  }, []);

  useShortcuts({ openPalette, toggleCollapsed, paused: palette || drawer });

  // Opening a page closes the drawer: adjusted while rendering, not in an effect.
  const [drawerPath, setDrawerPath] = React.useState(pathname);
  if (pathname !== drawerPath) {
    setDrawerPath(pathname);
    setDrawer(false);
  }
  React.useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const shell = React.useMemo(
    () => ({ collapsed, toggleCollapsed, openPalette }),
    [collapsed, toggleCollapsed, openPalette],
  );

  return (
    <ShellContext.Provider value={shell}>
      <div className="min-h-dvh bg-canvas">
        {/* The first Tab stop: straight to the page, past the sidebar and header. */}
        <a
          href="#main"
          className="focus-ring fixed left-3 top-3 z-[100] -translate-y-24 rounded-lg bg-surface px-4 py-2.5 text-sm font-bold text-fg-heading shadow-pop transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>
        {banner && <div className="sticky top-0 z-40">{banner}</div>}
        <div className="flex">
          <aside
            aria-label="Sidebar"
            className={cn(
              "sticky z-[35] hidden shrink-0 transition-[width] duration-300 ease-out lg:block",
              collapsed ? "w-[4.75rem]" : "w-[17rem]",
              banner ? "top-8 h-[calc(100dvh-2rem)]" : "top-0 h-dvh",
            )}
          >
            <Sidebar rail={collapsed} />
            {/* Fold or unfold: a small round handle on the sidebar's edge. */}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-keyshortcuts="["
              title={`${collapsed ? "Expand" : "Collapse"} sidebar  [`}
              className="focus-ring absolute -right-3 top-[1.375rem] z-10 grid size-6 place-items-center rounded-full border border-line bg-surface text-fg-subtle shadow-card transition-colors hover:text-fg"
            >
              <ChevronLeft
                className={cn("size-3.5 transition-transform duration-300", collapsed && "rotate-180")}
                aria-hidden
              />
            </button>
          </aside>

          {drawer && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div
                className="absolute inset-0 animate-fade-in bg-charcoal/50 backdrop-blur-[2px]"
                onClick={() => setDrawer(false)}
              />
              <aside
                aria-label="Menu"
                className="absolute inset-y-0 left-0 w-[18rem] max-w-[85vw] animate-slide-in-left overflow-hidden shadow-pop"
              >
                <Sidebar />
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label="Close menu"
                  className="focus-ring absolute right-3 top-3.5 grid size-9 place-items-center rounded-xl text-nav-muted hover:bg-white/[0.06] hover:text-nav-fg"
                >
                  <X className="size-[18px]" aria-hidden />
                </button>
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <Header
              banner={Boolean(banner)}
              actions={headerActions}
              onMenu={() => setDrawer(true)}
              onSearch={openPalette}
            />
            <main id="main" tabIndex={-1} className="flex-1 px-4 pb-28 pt-6 outline-none md:px-8 md:pt-8 lg:pb-12">
              <div key={pathname} className="mx-auto w-full max-w-[72rem] animate-slide-up">
                {children}
              </div>
            </main>
          </div>
        </div>

        <TabBar onMore={() => setDrawer(true)} />
        <CommandPalette open={palette} onClose={() => setPalette(false)} />
      </div>
    </ShellContext.Provider>
  );
}

/** Where you are (farm, page, deeper page) on the left; the page's tools on the right. */
function Header({
  banner,
  actions,
  onMenu,
  onSearch,
}: {
  banner: boolean;
  actions?: React.ReactNode;
  onMenu: () => void;
  onSearch: () => void;
}) {
  const pathname = usePathname();
  const { item, child } = pageFor(pathname);
  const mod = useModKey();
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky z-30 flex h-16 items-center gap-2 px-3 transition-[background-color,border-color,box-shadow] duration-200 md:px-8",
        banner ? "top-8" : "top-0",
        scrolled ? "border-b border-line bg-canvas/80 backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="focus-ring grid size-10 place-items-center rounded-xl text-fg-muted hover:bg-surface-subtle lg:hidden"
      >
        <MenuIcon className="size-5" aria-hidden />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          <li className="hidden min-w-0 items-center gap-1.5 sm:flex">
            <span className="truncate text-fg-subtle">Fowlex Farms</span>
            <ChevronRight className="size-3.5 shrink-0 text-fg-subtle/60" aria-hidden />
          </li>
          {item && (
            <li className="flex min-w-0 items-center gap-1.5">
              {child ? (
                <>
                  <Link href={item.href} className="focus-ring truncate rounded-md text-fg-muted hover:text-fg">
                    {item.label}
                  </Link>
                  <ChevronRight className="size-3.5 shrink-0 text-fg-subtle/60" aria-hidden />
                </>
              ) : (
                <span aria-current="page" className="truncate font-bold text-fg">
                  {item.label}
                </span>
              )}
            </li>
          )}
          {child && (
            <li aria-current="page" className="truncate font-bold text-fg">
              {child}
            </li>
          )}
        </ol>
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search or jump to"
          className="focus-ring hidden h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-fg-subtle shadow-button transition-colors hover:border-line-strong hover:text-fg md:flex lg:hidden"
        >
          <Search className="size-4" aria-hidden />
          <span className="pr-6">Search</span>
          <kbd className="rounded-md bg-surface-subtle px-1.5 text-[11px] font-semibold text-fg-muted">{mod} K</kbd>
        </button>
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search or jump to"
          className="focus-ring grid size-10 place-items-center rounded-xl text-fg-muted hover:bg-surface-subtle md:hidden"
        >
          <Search className="size-5" aria-hidden />
        </button>
        {actions}
      </div>
    </header>
  );
}

/** Phones and tablets: the pages along the bottom, in thumb's reach, and the rest under More. */
function TabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const { me } = useWorkspace();
  const items = navFor(me.role)
    .flatMap((g) => g.items)
    .slice(0, 4);

  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring relative flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors",
                  active ? "text-brand-fg" : "text-fg-subtle hover:text-fg",
                )}
              >
                {active && <span aria-hidden className="absolute top-0 h-[3px] w-8 rounded-b-full bg-brand" />}
                <Icon className="size-[22px]" aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onMore}
            className="focus-ring flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold text-fg-subtle hover:text-fg"
          >
            <MenuIcon className="size-[22px]" aria-hidden strokeWidth={1.75} />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** ⌘K / Ctrl K searches, `[` folds the sidebar, G then a letter jumps to a page. Not while typing. */
function useShortcuts({
  openPalette,
  toggleCollapsed,
  paused,
}: {
  openPalette: () => void;
  toggleCollapsed: () => void;
  paused: boolean;
}) {
  const router = useRouter();
  const { me } = useWorkspace();
  const pendingG = React.useRef(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        return openPalette();
      }
      const target = e.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") ||
        !!document.querySelector("dialog[open]");
      if (paused || typing || e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === "[") return toggleCollapsed();
      if (key === "/") {
        e.preventDefault();
        return openPalette();
      }
      if (Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const item = navFor(me.role)
          .flatMap((g) => g.items)
          .find((i) => i.key === key);
        if (item) router.push(item.href);
        return;
      }
      if (key === "g") pendingG.current = Date.now();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openPalette, toggleCollapsed, paused, router, me.role]);
}
