import {
  Bird,
  ChartColumn,
  ClipboardPen,
  FileSignature,
  HandCoins,
  House,
  ReceiptText,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { can, type Permission, type Role } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** "G" then this key goes here (shown in the sidebar and the command palette). */
  key: string;
  /** Other words people search for it by, in the command palette. */
  keywords?: string;
};
export type NavGroup = { title: string; items: NavItem[] };

/** The sidebar, in the order the farm works. Items the role can't open are hidden. */
export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/",
        label: "Overview",
        icon: House,
        permission: "finance.read",
        key: "h",
        keywords: "home dashboard summary today",
      },
    ],
  },
  {
    title: "Farm",
    items: [
      {
        href: "/batches",
        label: "Batches",
        icon: Bird,
        permission: "batch.read",
        key: "b",
        keywords: "birds chicks flock house placement mortality fcr growth",
      },
      {
        href: "/log",
        label: "Daily log",
        icon: ClipboardPen,
        permission: "log.write",
        key: "l",
        keywords: "deaths culls feed water weight today record",
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Warehouse,
        permission: "inventory.read",
        key: "i",
        keywords: "stock feed bags drugs vaccines equipment low stock reorder",
      },
      {
        href: "/suppliers",
        label: "Suppliers",
        icon: Truck,
        permission: "supplier.read",
        key: "u",
        keywords: "vendors hatchery feed mill purchases owed",
      },
    ],
  },
  {
    title: "Sales",
    items: [
      {
        href: "/customers",
        label: "Customers",
        icon: UserRound,
        permission: "customer.read",
        key: "c",
        keywords: "clients restaurants lounges hotels buyers statement credit",
      },
      {
        href: "/contracts",
        label: "Contracts",
        icon: FileSignature,
        permission: "contract.read",
        key: "t",
        keywords: "terms agreements price per kg per bird",
      },
      {
        href: "/sales",
        label: "Sales",
        icon: ShoppingCart,
        permission: "sales.read",
        key: "a",
        keywords: "orders deliveries sell birds",
      },
      {
        href: "/invoices",
        label: "Invoices",
        icon: ReceiptText,
        permission: "invoice.read",
        key: "v",
        keywords: "bills payments paystack overdue owed receivables",
      },
    ],
  },
  {
    title: "Money",
    items: [
      {
        href: "/expenses",
        label: "Expenses",
        icon: Wallet,
        permission: "expense.read",
        key: "e",
        keywords: "spend costs receipts transport fuel approvals budget",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: ChartColumn,
        permission: "finance.read",
        key: "r",
        keywords: "profit loss p&l cash flow aging export csv pdf",
      },
      {
        href: "/forecasts",
        label: "Forecasts",
        icon: TrendingUp,
        permission: "finance.read",
        key: "f",
        keywords: "predictions projection trend what if break even",
      },
    ],
  },
  {
    title: "Team",
    items: [
      {
        href: "/people",
        label: "People",
        icon: Users,
        permission: "people.read",
        key: "p",
        keywords: "staff workers employees attendance",
      },
      {
        href: "/payroll",
        label: "Payroll",
        icon: HandCoins,
        permission: "payroll.read",
        key: "y",
        keywords: "salary wages payslips advances pay staff",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        permission: "settings.manage",
        key: "s",
        keywords: "business invoice prefix users invite houses approval limit",
      },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((group) => group.items);

/** The groups and items a role can open; empty groups are dropped. */
export function navFor(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(role, i.permission)) })).filter(
    (g) => g.items.length,
  );
}

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/** The page you're on, for the breadcrumb: the nav item, plus a deeper page's own name. */
export function pageFor(pathname: string): { item?: NavItem; child?: string } {
  const item = [...ALL_ITEMS].sort((a, b) => b.href.length - a.href.length).find((i) => isActive(pathname, i.href));
  const child =
    item && pathname !== item.href && item.href !== "/"
      ? (CHILD_NAMES[pathname] ?? (pathname.endsWith("/new") ? "New" : "Details"))
      : undefined;
  return { item, child };
}

/** Deeper pages with names of their own. */
const CHILD_NAMES: Record<string, string> = { "/settings/users": "Users" };
