"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { InvoiceSheet } from "./invoice-sheet";
import { NewInvoiceSheet } from "./new-invoice-sheet";
import { EmptyState, Fab, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatRange } from "@/lib/dates";
import { INVOICE_STATUS_LABELS, INVOICE_TONE } from "@/lib/invoices/rules";
import type { InvoiceView } from "@/lib/invoices/service";
import { formatNaira } from "@/lib/money";

const day = (d: string) => formatRange({ from: d, to: d });

/**
 * Invoices as a list that opens each in its sheet, with "New invoice". On the Invoices page (every
 * customer, filtered) and on a customer's page (theirs, the customer already set).
 */
export function InvoicesList({
  invoices,
  customers,
  customerId,
  vatRateBps,
  today,
  canWrite,
  canPay = false,
  simulated = false,
  start,
  openId,
  title = "Invoices",
  description,
  filters = false,
  fab = false,
  showCustomer = true,
}: {
  invoices: InvoiceView[];
  customers: { id: string; name: string; email: string }[];
  customerId?: string;
  vatRateBps: number | null;
  today: string;
  canWrite: boolean;
  canPay?: boolean;
  simulated?: boolean;
  /** Open "New invoice" at once, for a customer and orders (from an order's "Make an invoice"). */
  start?: { customerId?: string; orderIds?: string[] };
  /** Open this invoice at once (from an order's "See its invoice"). */
  openId?: string;
  title?: string;
  description?: string;
  filters?: boolean;
  fab?: boolean;
  showCustomer?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<InvoiceView | "new" | null>(
    start ? "new" : (invoices.find((i) => i.id === openId) ?? null),
  );
  const [show, setShow] = React.useState<"unpaid" | "paid" | "all">("unpaid");
  const unpaid = (i: InvoiceView) => i.status !== "paid" && i.status !== "void";
  const shown = filters
    ? invoices.filter((i) => show === "all" || (show === "unpaid" ? unpaid(i) : i.status === "paid"))
    : invoices;
  const owed = invoices.filter(unpaid).reduce((n, i) => n + i.balanceKobo, 0);
  const add = canWrite ? (
    <Button size="sm" disabled={!customers.length} reason="Add a customer first." onClick={() => setOpen("new")}>
      <Plus /> New invoice
    </Button>
  ) : undefined;
  const done = (message: string) => {
    setOpen(null);
    toast.success(message);
    router.refresh();
  };

  return (
    <>
      <Panel
        title={title}
        description={description ?? (owed > 0 ? `${formatNaira(owed)} still to be paid.` : undefined)}
        actions={invoices.length ? add : undefined}
        flush
      >
        {filters && invoices.length > 0 && (
          <div className="px-5 pb-3">
            <Segmented
              label="Show"
              value={show}
              onChange={setShow}
              options={[
                { value: "unpaid", label: "To be paid" },
                { value: "paid", label: "Paid" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
        )}
        {invoices.length === 0 ? (
          <EmptyState
            icon={<ReceiptText />}
            title="No invoices yet"
            description="Once an order is delivered, bill it here: the invoice is numbered, worked out with VAT if it's on, and emailed as a PDF."
            action={add}
          />
        ) : shown.length === 0 ? (
          <EmptyState title="Nothing here" description="No invoices match this filter." />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="focus-ring flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate font-semibold text-fg">
                      {showCustomer ? i.customerName : i.number}
                    </span>
                    <span className="num block text-xs text-fg-muted">
                      {showCustomer && `${i.number} · `}due {day(i.dueDate)}
                    </span>
                  </span>
                  <span className="num flex shrink-0 flex-col items-end gap-1.5 text-right">
                    <span className="block font-semibold text-fg">
                      {formatNaira(i.status === "paid" || i.status === "void" ? i.totalKobo : i.balanceKobo)}
                    </span>
                    <Badge tone={INVOICE_TONE[i.status]}>{INVOICE_STATUS_LABELS[i.status]}</Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {fab && canWrite && customers.length > 0 && (
        <Fab label="New invoice" icon={<Plus />} onClick={() => setOpen("new")} />
      )}
      {open === "new" ? (
        <NewInvoiceSheet
          customers={customers}
          customerId={start?.customerId ?? customerId}
          orderIds={start?.orderIds}
          vatRateBps={vatRateBps}
          today={today}
          onClose={() => {
            setOpen(null);
            if (start) router.replace("/invoices", { scroll: false });
          }}
          onSaved={(message) => {
            done(message);
            if (start) router.replace("/invoices", { scroll: false });
          }}
        />
      ) : (
        open && (
          <InvoiceSheet
            invoice={open}
            canWrite={canWrite}
            canPay={canPay}
            simulated={simulated}
            today={today}
            onClose={() => setOpen(null)}
            onSaved={done}
          />
        )
      )}
    </>
  );
}
