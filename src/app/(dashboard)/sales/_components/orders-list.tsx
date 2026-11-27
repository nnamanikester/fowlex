"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { type BatchOption, type CustomerOption, OrderSheet } from "./order-sheet";
import { EmptyState, Fab, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { ORDER_STATUS_LABELS, ORDER_TONE } from "@/lib/sales/rules";
import type { OrderView } from "@/lib/sales/service";

const day = (d: string) => formatRange({ from: d, to: d });

/**
 * Orders as a list that opens each in its sheet, with "New order". On the Sales page (every
 * customer, with filters), a customer's page (theirs) and a batch's Sales tab (its birds).
 */
export function OrdersList({
  orders,
  customers,
  customerId,
  batches,
  today,
  canWrite,
  title = "Orders",
  description,
  filters = false,
  fab = false,
  showCustomer = true,
  openId,
}: {
  /** An order to open at once (from the new-order email). */
  openId?: string;
  orders: OrderView[];
  customers: CustomerOption[];
  customerId?: string;
  batches: BatchOption[];
  today: string;
  canWrite: boolean;
  title?: string;
  description?: string;
  filters?: boolean;
  fab?: boolean;
  showCustomer?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<OrderView | "new" | null>(() => orders.find((o) => o.id === openId) ?? null);
  const [show, setShow] = React.useState<"pending" | "done" | "all">("pending");
  const shown = filters
    ? orders.filter((o) => show === "all" || (show === "pending" ? o.status === "pending" : o.status !== "pending"))
    : orders;
  const reason = !customers.length
    ? "Add a customer first."
    : !batches.length
      ? "There's no batch with birds to sell."
      : "";
  const add = canWrite ? (
    <Button size="sm" disabled={!!reason} reason={reason} onClick={() => setOpen("new")}>
      <Plus /> New order
    </Button>
  ) : undefined;
  const birds = (o: OrderView) => o.lines.reduce((n, l) => n + l.birds, 0);

  return (
    <>
      <Panel title={title} description={description} actions={orders.length ? add : undefined} flush>
        {filters && orders.length > 0 && (
          <div className="px-5 pb-3">
            <Segmented
              label="Show"
              value={show}
              onChange={setShow}
              options={[
                { value: "pending", label: "To deliver" },
                { value: "done", label: "Delivered" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
        )}
        {orders.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart />}
            title="No orders yet"
            description="Book what a customer is buying: which batch, how many birds and the day. Delivered, the birds come off the batch."
            action={add}
          />
        ) : shown.length === 0 ? (
          <EmptyState title="Nothing here" description="No orders match this filter." />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setOpen(o)}
                  className="focus-ring flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg">
                      {showCustomer ? o.customerName : o.number}
                    </span>
                    <span className="num block text-xs text-fg-muted">
                      {showCustomer && `${o.number} · `}
                      {birds(o).toLocaleString("en-NG")} birds · {day(o.deliveredOn ?? o.deliveryDate)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-right">
                    <span className="block font-semibold text-fg">{formatNaira(o.totalKobo)}</span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {o.source === "online" && <Badge tone="brand">Online</Badge>}
                      <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {fab && canWrite && !reason && <Fab label="New order" icon={<Plus />} onClick={() => setOpen("new")} />}
      {open && (
        <OrderSheet
          order={open === "new" ? null : open}
          customers={customers}
          customerId={customerId}
          batches={batches}
          today={today}
          canWrite={canWrite}
          onClose={() => setOpen(null)}
          onSaved={(message) => {
            setOpen(null);
            toast.success(message);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
