"use client";

import * as React from "react";
import Link from "next/link";
import { CircleAlert, Plus, ReceiptText, Trash2, Truck, X } from "lucide-react";

import { Field } from "@/components/auth";
import { ConfirmDialog } from "@/components/kit";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/auth/client";
import { PER_UNIT, type Pricing } from "@/lib/contracts/rules";
import { formatRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { kg, lineAmount, ORDER_STATUS_LABELS, ORDER_TONE, type OrderLine } from "@/lib/sales/rules";
import type { OrderView, Quote } from "@/lib/sales/service";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

export type BatchOption = { id: string; code: string; liveBirds: number; birdGrams?: number };
export type CustomerOption = { id: string; name: string };
type Row = { key: number; batchId: string; birds: string; kg: string };

const day = (d: string) => formatRange({ from: d, to: d });
const toGrams = (s: string) => Math.round(Number(s.replace(/,/g, "") || 0) * 1000);
const fromGrams = (g: number) => (g ? String(Math.round(g / 100) / 10) : "");
let keys = 0;

/**
 * An order from booking to delivery. Booking: who, when, which batches and how many; the price
 * is the customer's contract on that day, or the farm's price per kg. Delivering: the birds and
 * weight as handed over. Over the customer's limit it says so and asks before saving.
 */
export function OrderSheet({
  order,
  customers,
  customerId,
  batches,
  today,
  canWrite,
  onClose,
  onSaved,
}: {
  order: OrderView | null;
  customers: CustomerOption[];
  customerId?: string;
  batches: BatchOption[];
  today: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [mode, setMode] = React.useState<"book" | "deliver">("book");
  const batchFor = (id: string) => batches.find((b) => b.id === id);
  const [customer, setCustomer] = React.useState(order?.customerId ?? customerId ?? "");
  const [date, setDate] = React.useState(order?.deliveryDate ?? today);
  const [deliveredOn, setDeliveredOn] = React.useState(today);
  const [rows, setRows] = React.useState<Row[]>(
    order
      ? order.lines.map((l) => ({
          key: keys++,
          batchId: l.batchId,
          birds: String(l.birds),
          // An estimate isn't a weighing: the field stays empty until they're weighed.
          kg: l.weighed === false ? "" : fromGrams(l.weightGrams),
        }))
      : [{ key: keys++, batchId: batches.length === 1 ? batches[0].id : "", birds: "", kg: "" }],
  );
  const [pricing, setPricing] = React.useState<Pricing>(order?.lines[0]?.pricing ?? "perKg");
  const [price, setPrice] = React.useState<number | null>(order?.lines[0]?.priceKobo ?? null);
  const [deliveryKobo, setDeliveryKobo] = React.useState<number | null>(order?.deliveryKobo ?? 0);
  const [notes, setNotes] = React.useState(order?.notes ?? "");
  const [submitted, setSubmitted] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [q, setQ] = React.useState<{ key: string; quote: Quote | null; error?: string } | null>(null);
  const action = useAction();

  const status = order?.status ?? "pending";
  // Delivered or not, an order can be put right until its invoice is paid.
  const editable = canWrite && (status === "pending" || status === "delivered") && !order?.locked;
  const delivering = mode === "deliver";
  // The price on the day it's delivered (when delivering) or booked for.
  const priceDay = delivering ? deliveredOn : date;
  const quoteKey = `${customer}|${priceDay}`;
  const quote = q?.key === quoteKey ? q.quote : null;

  React.useEffect(() => {
    if (!customer || !priceDay || !editable) return;
    let live = true;
    apiRequest<Quote>(`/api/sales/quote?customerId=${customer}&date=${priceDay}`, "GET").then(
      (found) => {
        if (!live) return;
        setQ({ key: quoteKey, quote: found });
        if (found.contract) {
          setPricing(found.pricing);
          setPrice(found.priceKobo);
        } else if (!order) setPrice((p) => p ?? found.priceKobo);
      },
      (e: { message: string }) => live && setQ({ key: quoteKey, quote: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [customer, priceDay, quoteKey, editable, order]);

  const locked = !!quote?.contract;
  const lines: OrderLine[] = rows.map((r) => ({
    batchId: r.batchId,
    birds: Number(r.birds.replace(/\D/g, "") || 0),
    weightGrams: toGrams(r.kg),
    priceKobo: price ?? 0,
    pricing,
  }));
  /** Not weighed: the batch's weight a bird times the birds, as the server will price it. */
  const estimate = (l: OrderLine) => Math.round((batchFor(l.batchId)?.birdGrams ?? 0) * l.birds);
  const priced = (l: OrderLine) => (l.pricing === "perKg" && !l.weightGrams ? { ...l, weightGrams: estimate(l) } : l);
  const total =
    (editable ? lines.map(priced) : (order?.lines ?? [])).reduce((n, l) => n + lineAmount(l), 0) + (deliveryKobo ?? 0);
  const owed = quote?.owedKobo ?? 0;
  const over = quote?.limitKobo !== null && quote?.limitKobo !== undefined && owed + total > quote.limitKobo;
  const lineError = (i: number, f: keyof OrderLine) => action.fieldError(`lines.${i}.${f}`);

  const problems = [
    !customer && "Choose the customer.",
    !price && "Enter the price.",
    rows.some((r) => !r.batchId) && "Choose the batch on every line.",
    lines.some((l) => l.birds < 1) && "Enter how many birds on every line.",
  ].filter(Boolean) as string[];

  const send = (confirm = false) => {
    setSubmitted(true);
    if (problems.length) return;
    const body = { customerId: customer, deliveryDate: date, lines, deliveryKobo: deliveryKobo ?? 0, notes, confirm };
    void action.run(
      () =>
        !order
          ? apiRequest<OrderView>("/api/sales", "POST", body)
          : delivering
            ? apiRequest<OrderView>(`/api/sales/${order.id}/deliver`, "POST", {
                ...body,
                deliveredOn,
                version: order.version,
              })
            : apiRequest<OrderView>(`/api/sales/${order.id}`, "PATCH", { ...body, version: order.version }),
      {
        key: delivering ? "deliver" : "save",
        onSuccess: (saved) =>
          onSaved(
            delivering
              ? `${saved.number} delivered: ${saved.lines.reduce((n, l) => n + l.birds, 0).toLocaleString("en-NG")} birds off the farm.`
              : order
                ? `${saved.number} saved.`
                : `${saved.number} booked for ${saved.customerName}.`,
          ),
      },
    );
  };
  const overCredit = action.failure?.code === "over_credit";

  const title = order ? `${order.number} · ${order.customerName}` : "New order";

  return (
    <>
      <Sheet
        open
        onClose={() => !action.busy && onClose()}
        title={delivering ? `Deliver ${order?.number}` : title}
        subtitle={
          order ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tone={ORDER_TONE[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
              {order.deliveredOn ? `Delivered ${day(order.deliveredOn)}` : `For ${day(order.deliveryDate)}`}
            </span>
          ) : (
            "Birds a customer is buying"
          )
        }
        footer={
          editable ? (
            <div className="space-y-2">
              <p className="num flex items-baseline justify-between text-sm" aria-live="polite">
                <span className="text-fg-muted">Total</span>
                <span className="text-lg font-semibold text-fg">{formatNaira(total)}</span>
              </p>
              <ActionFeedback action={action} />
              {submitted && problems[0] && !action.failure && (
                <p role="alert" className="text-sm font-medium text-danger-fg">
                  {problems[0]}
                </p>
              )}
              {overCredit ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="lg" disabled={action.busy} onClick={() => action.clear()}>
                    Change it
                  </Button>
                  <Button size="lg" loading={action.busy} onClick={() => send(true)}>
                    Save anyway
                  </Button>
                </div>
              ) : delivering ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="ghost" size="lg" disabled={action.busy} onClick={() => setMode("book")}>
                    Back
                  </Button>
                  <Button size="lg" loading={action.isPending("deliver")} disabled={action.busy} onClick={() => send()}>
                    <Truck /> Mark delivered
                  </Button>
                </div>
              ) : order ? (
                <>
                  <div className={cn("grid gap-2", status === "pending" && "grid-cols-2")}>
                    <Button
                      variant={status === "pending" ? "secondary" : "primary"}
                      size="lg"
                      loading={action.isPending("save")}
                      disabled={action.busy}
                      onClick={() => send()}
                    >
                      Save changes
                    </Button>
                    {status === "pending" && (
                      <Button size="lg" disabled={action.busy} onClick={() => setMode("deliver")}>
                        <Truck /> Delivered
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    fullWidth
                    className="text-danger-fg"
                    disabled={action.busy}
                    onClick={() => setCancelling(true)}
                  >
                    <Trash2 /> Delete order
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  fullWidth
                  loading={action.isPending("save")}
                  disabled={action.busy}
                  onClick={() => send()}
                >
                  Book order
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {order?.contact && <OnlineContact contact={order.contact} />}
        {editable && order?.invoiceId && (
          <p className="mb-4 flex flex-wrap items-center gap-x-2 rounded-xl bg-surface-subtle px-4 py-3 text-sm text-fg-muted">
            Its invoice follows every change until it&apos;s paid.
            <Link href={`/invoices?open=${order.invoiceId}`} className="focus-ring rounded font-semibold text-brand-fg">
              See its invoice
            </Link>
          </p>
        )}
        {!editable && order ? (
          <OrderSummary order={order} />
        ) : (
          <div className="space-y-5">
            {!order && !customerId && (
              <Field id="customerId" label="Customer" error={action.fieldError("customerId")}>
                {(a11y) => (
                  <Select {...a11y} value={customer} onChange={(e) => setCustomer(e.target.value)}>
                    <option value="">Choose the customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {delivering ? (
              <Field id="deliveredOn" label="Delivered on" error={action.fieldError("deliveredOn")}>
                {(a11y) => (
                  <Input
                    {...a11y}
                    type="date"
                    value={deliveredOn}
                    max={today}
                    onChange={(e) => setDeliveredOn(e.target.value)}
                  />
                )}
              </Field>
            ) : (
              <Field id="deliveryDate" label="Delivery day" error={action.fieldError("deliveryDate")}>
                {(a11y) => <Input {...a11y} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
              </Field>
            )}

            <section className="space-y-3 rounded-xl border border-line p-4">
              <h3 className="text-sm font-semibold text-fg">Price</h3>
              {locked && quote?.contract ? (
                <p className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-fg">
                  From their contract <strong>{quote.contract.number}</strong>:{" "}
                  <strong className="num">
                    {formatNaira(quote.priceKobo!)} {PER_UNIT[quote.pricing]}
                  </strong>
                </p>
              ) : (
                <>
                  <Segmented
                    label="Priced"
                    className="w-full"
                    value={pricing}
                    onChange={setPricing}
                    options={[
                      { value: "perKg", label: "Per kg" },
                      { value: "perBird", label: "Per bird" },
                    ]}
                  />
                  <Field
                    id="price"
                    label={`Price ${PER_UNIT[pricing]}`}
                    error={submitted && !price ? "Enter the price." : action.fieldError("lines.0.priceKobo")}
                    hint={
                      customer && !quote?.contract
                        ? "No contract runs on this day: set the price for this order."
                        : undefined
                    }
                  >
                    {(a11y) => <MoneyInput {...a11y} value={price} onChange={setPrice} placeholder="3,200.00" />}
                  </Field>
                </>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-fg">Birds</h3>
              {rows.map((r, i) => {
                const b = batchFor(r.batchId);
                const short = b && lines[i].birds > b.liveBirds;
                return (
                  <div key={r.key} className="space-y-3 rounded-xl border border-line p-3">
                    <div className="flex items-end gap-2">
                      <Field id={`lines.${i}.batchId`} label="From batch" error={lineError(i, "batchId")}>
                        {(a11y) => (
                          <Select
                            {...a11y}
                            value={r.batchId}
                            onChange={(e) =>
                              setRows((list) =>
                                list.map((x) => (x.key === r.key ? { ...x, batchId: e.target.value } : x)),
                              )
                            }
                          >
                            <option value="">Choose the batch</option>
                            {batches.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.code} · {x.liveBirds.toLocaleString("en-NG")} birds
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      {rows.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove line ${i + 1}`}
                          onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        id={`lines.${i}.birds`}
                        label="Birds"
                        error={
                          lineError(i, "birds") ??
                          (short ? `Only ${b!.liveBirds.toLocaleString("en-NG")} left` : undefined)
                        }
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            inputMode="numeric"
                            className="num"
                            placeholder="200"
                            value={r.birds}
                            onChange={(e) =>
                              setRows((list) =>
                                list.map((x) =>
                                  x.key === r.key ? { ...x, birds: e.target.value.replace(/\D/g, "").slice(0, 7) } : x,
                                ),
                              )
                            }
                          />
                        )}
                      </Field>
                      <Field
                        id={`lines.${i}.weightGrams`}
                        label="Total weight (kg)"
                        error={lineError(i, "weightGrams")}
                        hint={
                          pricing === "perKg" && !toGrams(r.kg) && r.batchId && Number(r.birds)
                            ? `Not weighed: about ${kg(estimate(lines[i]))}`
                            : "Optional"
                        }
                      >
                        {(a11y) => (
                          <Input
                            {...a11y}
                            inputMode="decimal"
                            className="num"
                            placeholder="440"
                            value={r.kg}
                            onChange={(e) =>
                              setRows((list) =>
                                list.map((x) =>
                                  x.key === r.key ? { ...x, kg: e.target.value.replace(/[^\d.]/g, "").slice(0, 9) } : x,
                                ),
                              )
                            }
                          />
                        )}
                      </Field>
                    </div>
                    {price ? (
                      <p className="num text-right text-sm text-fg-muted">
                        {pricing === "perKg" && !lines[i].weightGrams
                          ? `About ${formatNaira(lineAmount(priced(lines[i])))}`
                          : formatNaira(lineAmount(lines[i]))}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              <Button
                variant="secondary"
                size="sm"
                disabled={rows.length >= 20}
                reason="That's the most lines on one order."
                onClick={() => setRows((list) => [...list, { key: keys++, batchId: "", birds: "", kg: "" }])}
              >
                <Plus /> Birds from another batch
              </Button>
            </section>

            <Field
              id="deliveryKobo"
              label="Delivery charge"
              error={action.fieldError("deliveryKobo")}
              hint="What they pay for delivery, if anything"
            >
              {(a11y) => <MoneyInput {...a11y} value={deliveryKobo} onChange={setDeliveryKobo} placeholder="0.00" />}
            </Field>
            <Field id="notes" label="Notes" error={action.fieldError("notes")} hint="Optional">
              {(a11y) => (
                <Textarea {...a11y} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
              )}
            </Field>

            {quote && (
              <p
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm",
                  over ? "border-warning-line bg-warning-subtle text-fg" : "border-line text-fg-muted",
                )}
              >
                {over && <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden />}
                <span>
                  They already owe <strong className="num">{formatNaira(owed)}</strong>
                  {quote.limitKobo !== null && (
                    <>
                      {" "}
                      of their <strong className="num">{formatNaira(quote.limitKobo)}</strong> limit
                      {over && ": this order takes them over it"}
                    </>
                  )}
                  .
                </span>
              </p>
            )}
            {q?.key === quoteKey && q.error && <p className="text-sm text-danger-fg">{q.error}</p>}
          </div>
        )}
      </Sheet>
      {order && (
        <ConfirmDialog
          open={cancelling}
          onOpenChange={setCancelling}
          title={`Delete ${order.number}?`}
          description={`Its invoice goes with it${
            status === "delivered" ? ", and the birds count as on the farm again" : ""
          }. Use this for an order made by mistake.`}
          confirmLabel="Delete order"
          onConfirm={async () => {
            await apiRequest(`/api/sales/${order.id}`, "DELETE");
            onSaved(`${order.number} deleted, with its invoice.`);
          }}
        />
      )}
    </>
  );
}

/** A delivered, invoiced or cancelled order, as it went. */
function OrderSummary({ order }: { order: OrderView }) {
  return (
    <div className="space-y-5">
      {order.contract && (
        <p className="text-sm text-fg-muted">
          Priced by contract <strong className="text-fg">{order.contract.number}</strong>
        </p>
      )}
      <div className="rounded-xl border border-line">
        <ul className="divide-y divide-line text-sm">
          {order.lines.map((l, i) => (
            <li key={i} className="num flex justify-between gap-3 px-4 py-2.5">
              <span className="text-fg">
                {l.birds.toLocaleString("en-NG")} birds from {order.batchCodes[l.batchId]}
                <span className="block text-xs text-fg-muted">
                  {l.weightGrams ? `${kg(l.weightGrams)} · ` : ""}
                  {formatNaira(l.priceKobo)} {PER_UNIT[l.pricing]}
                </span>
              </span>
              <span className="font-semibold text-fg">{formatNaira(lineAmount(l))}</span>
            </li>
          ))}
          {order.deliveryKobo > 0 && (
            <li className="num flex justify-between px-4 py-2.5">
              <span className="text-fg-muted">Delivery</span>
              <span className="text-fg">{formatNaira(order.deliveryKobo)}</span>
            </li>
          )}
          <li className="num flex justify-between px-4 py-2.5 font-semibold">
            <span className="text-fg">Total</span>
            <span className="text-fg">{formatNaira(order.totalKobo)}</span>
          </li>
        </ul>
      </div>
      {order.notes && <p className="text-sm text-fg-muted">{order.notes}</p>}
      {order.status === "delivered" && !order.invoiceId && (
        <LinkButton href={`/invoices?new=${order.customerId}&orders=${order.id}`} fullWidth>
          <ReceiptText /> Make an invoice
        </LinkButton>
      )}
      {order.invoiceId && (
        <p className="text-sm text-fg-muted">
          {order.locked && order.status !== "invoiced"
            ? "Money is paid on its invoice, so it stays as it is. "
            : order.status === "invoiced"
              ? "It's on an invoice with other orders. "
              : ""}
          <Link href={`/invoices?open=${order.invoiceId}`} className="focus-ring rounded font-semibold text-brand-fg">
            See its invoice
          </Link>
        </p>
      )}
    </div>
  );
}

/** Who ordered on the order page, to call and confirm. */
function OnlineContact({ contact }: { contact: NonNullable<OrderView["contact"]> }) {
  const phone = /^\+234\d{10}$/.test(contact.phone)
    ? `0${contact.phone.slice(4, 7)} ${contact.phone.slice(7, 10)} ${contact.phone.slice(10)}`
    : contact.phone;
  return (
    <div className="mb-5 space-y-1 rounded-xl border border-brand-line bg-brand-subtle px-4 py-3 text-sm text-fg">
      <p className="font-semibold">
        Ordered online by {contact.name}
        {contact.business && ` for ${contact.business}`}
      </p>
      <p>
        <a href={`tel:${contact.phone}`} className="focus-ring rounded font-semibold text-brand-fg">
          Call {phone}
        </a>
        {contact.email && <span className="text-fg-muted"> · {contact.email}</span>}
      </p>
      <p className="text-fg-muted">
        {contact.delivery ? `Deliver to: ${contact.address}` : "Collecting from the farm"}
      </p>
    </div>
  );
}
