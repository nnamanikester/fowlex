"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Mail, MapPin, Pencil, Phone, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { CustomerSheet } from "../../_components/customer-sheet";
import { Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth/client";
import { CUSTOMER_TYPE_LABELS, termsLine } from "@/lib/customers/rules";
import type { CustomerView } from "@/lib/customers/service";
import { formatNaira } from "@/lib/money";
import { formatPhone } from "@/lib/suppliers/rules";
import { useAction } from "@/lib/use-action";

/** One customer: who they are, how to reach them and their terms. Contracts, orders and invoices join as they're built. */
export function CustomerDetail({
  customer: c,
  defaultTermsDays,
  canWrite,
  children,
}: {
  customer: CustomerView;
  defaultTermsDays: number;
  canWrite: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const invite = useAction();

  return (
    <div className="space-y-5">
      <Link
        href="/customers"
        className="focus-ring inline-flex items-center gap-1 rounded-md text-sm font-medium text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-4" aria-hidden /> Customers
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-fg-heading">
            <span className="min-w-0 [overflow-wrap:anywhere]">{c.name}</span>
            {c.status === "archived" && <Badge>Archived</Badge>}
            {c.hasLogin && <Badge tone="info">Uses the portal</Badge>}
            {c.invited && <Badge>Invited to the portal</Badge>}
            {c.walkIn && <Badge tone="brand">No details needed</Badge>}
          </h1>
          <p className="text-sm text-fg-muted">
            {CUSTOMER_TYPE_LABELS[c.type]}
            {c.contactName && ` · ${c.contactName}`}
          </p>
        </div>
        {canWrite && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => setEditing(true)}>
              <Pencil /> Edit details
            </Button>
            {!c.hasLogin && c.status === "active" && !c.walkIn && (
              <Button
                className="flex-1 sm:flex-none"
                loading={invite.busy}
                disabled={!c.email}
                reason="Add their email first: the invite goes there."
                onClick={() =>
                  void invite.run(() => apiRequest<CustomerView>(`/api/customers/${c.id}/invite`, "POST"), {
                    toastError: true,
                    success: `Invite sent to ${c.email}: they set a password, then see their invoices in the portal.`,
                    onSuccess: () => router.refresh(),
                  })
                }
              >
                <UserPlus /> {c.invited ? "Send the invite again" : "Invite to the portal"}
              </Button>
            )}
          </div>
        )}
      </div>

      <Panel>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Terms" value={termsLine(c.termsDays)} />
          <Fact
            label="Most they may owe"
            value={c.creditLimitKobo === null ? "No limit" : formatNaira(c.creditLimitKobo)}
          />
          <div>
            <dt className="text-xs text-fg-muted">Phone</dt>
            <dd>
              {c.phone ? (
                <a
                  href={`tel:${c.phone}`}
                  className="focus-ring inline-flex items-center gap-1.5 rounded font-medium text-brand-fg"
                >
                  <Phone className="size-4" aria-hidden /> {formatPhone(c.phone)}
                </a>
              ) : (
                <span className="text-fg-muted">Not added</span>
              )}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-fg-muted">Email</dt>
            <dd className="min-w-0">
              {c.email ? (
                <a
                  href={`mailto:${c.email}`}
                  className="focus-ring inline-flex max-w-full items-center gap-1.5 rounded font-medium text-brand-fg"
                >
                  <Mail className="size-4 shrink-0" aria-hidden /> <span className="truncate">{c.email}</span>
                </a>
              ) : (
                <span className="text-warning-fg">Add one to email them invoices</span>
              )}
            </dd>
          </div>
          {c.address && (
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-xs text-fg-muted">Delivery address</dt>
              <dd className="flex items-start gap-1.5 text-fg">
                <MapPin className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden /> {c.address}
              </dd>
            </div>
          )}
          {c.notes && (
            <div className="sm:col-span-2 lg:col-span-4">
              <dt className="text-xs text-fg-muted">Notes</dt>
              <dd className="text-fg">{c.notes}</dd>
            </div>
          )}
        </dl>
      </Panel>

      {children}

      {editing && (
        <CustomerSheet
          customer={c}
          defaultTermsDays={defaultTermsDays}
          onClose={() => setEditing(false)}
          onSaved={(message, saved) => {
            setEditing(false);
            toast.success(message);
            if (saved) router.refresh();
            else router.push("/customers");
          }}
        />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="num font-semibold text-fg">{value}</dd>
    </div>
  );
}
