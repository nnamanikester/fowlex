"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, Plus, Search, Store } from "lucide-react";
import { toast } from "sonner";

import { CustomerSheet } from "./customer-sheet";
import { EmptyState, Fab, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CUSTOMER_TYPE_LABELS, termsLine } from "@/lib/customers/rules";
import type { CustomerView } from "@/lib/customers/service";
import { formatNaira } from "@/lib/money";
import { formatPhone } from "@/lib/suppliers/rules";

/** Every customer as a card; each opens the customer's page. */
export function CustomersBoard({
  customers,
  defaultTermsDays,
  canWrite,
}: {
  customers: CustomerView[];
  defaultTermsDays: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  const q = query.trim().toLowerCase();
  const shown = customers.filter(
    (c) =>
      (showArchived || c.status === "active") &&
      (!q || `${c.name} ${c.contactName} ${c.phone} ${c.email}`.toLowerCase().includes(q)),
  );
  const add = canWrite ? (
    <Button size="sm" onClick={() => setAdding(true)}>
      <Plus /> Add a customer
    </Button>
  ) : undefined;

  return (
    <div className="space-y-4">
      {customers.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Store />}
            title="No customers yet"
            description="Add the restaurants, lounges and hotels you sell to. Their contracts, orders and invoices then live on their page."
            action={add}
          />
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search customers</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                type="search"
                className="pl-9"
                placeholder="Search by name, contact or phone"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {canWrite && (
              <Button size="sm" className="hidden lg:inline-flex" onClick={() => setAdding(true)}>
                <Plus /> Add a customer
              </Button>
            )}
          </div>
          {shown.length === 0 ? (
            <Panel>
              <EmptyState title="No one matches" description="Try another name, or clear the search." />
            </Panel>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((c) => (
                <li key={c.id} className="relative min-w-0">
                  <Link
                    href={`/customers/${c.id}`}
                    className="focus-ring flex h-full w-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 pb-14 text-left shadow-card hover:border-line-strong"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 space-y-0.5">
                        <span className="block truncate font-display text-lg font-bold text-fg-heading">{c.name}</span>
                        <span className="block text-sm text-fg-muted">
                          {CUSTOMER_TYPE_LABELS[c.type]}
                          {c.contactName && ` · ${c.contactName}`}
                        </span>
                      </span>
                      {c.walkIn ? (
                        <Badge tone="brand">No details needed</Badge>
                      ) : c.status === "archived" ? (
                        <Badge>Archived</Badge>
                      ) : (
                        c.hasLogin && <Badge tone="info">Uses the portal</Badge>
                      )}
                    </span>
                    <span className="num text-sm text-fg">
                      {termsLine(c.termsDays)}
                      {c.creditLimitKobo !== null && ` · up to ${formatNaira(c.creditLimitKobo)} owed`}
                    </span>
                  </Link>
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="focus-ring absolute bottom-3 left-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-fg hover:bg-brand-subtle"
                    >
                      <Phone className="size-4" aria-hidden /> {formatPhone(c.phone)}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {customers.some((c) => c.status === "archived") && (
            <button
              type="button"
              className="focus-ring rounded-md text-sm font-medium text-brand-fg"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide archived customers" : "Show archived customers"}
            </button>
          )}
        </>
      )}
      {canWrite && <Fab label="Add a customer" icon={<Plus />} onClick={() => setAdding(true)} />}
      {adding && (
        <CustomerSheet
          customer={null}
          defaultTermsDays={defaultTermsDays}
          onClose={() => setAdding(false)}
          onSaved={(message, saved) => {
            setAdding(false);
            toast.success(message);
            if (saved) router.push(`/customers/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}
