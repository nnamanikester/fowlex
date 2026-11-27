"use client";

import * as React from "react";
import { Banknote, Clock, Landmark, Minus, Plus, UserRound } from "lucide-react";

import { Field } from "@/components/auth";
import { TransferAccount } from "@/components/payments/transfer-account";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/auth/client";
import type { CollectionView } from "@/lib/collections/service";
import type { Pricing } from "@/lib/contracts/rules";
import { formatNaira } from "@/lib/money";
import type { QuickSale } from "@/lib/sales/quick";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

type PaidBy = "cash" | "transfer" | "later";
const PER_BIRD = "fowlex.sell.perBird";

/**
 * Selling over the counter, for anyone, in one sheet: how many birds, the price, and how they pay.
 * Their name or phone is optional. Cash is recorded at once; Transfer shows a bank account that
 * turns to Paid when the money lands; Later leaves the invoice to pay.
 */
export function SellNowSheet({
  batches,
  pricePerKgKobo,
  simulated,
  onClose,
  onDone,
}: {
  batches: { id: string; code: string; free: number }[];
  pricePerKgKobo: number | null;
  simulated: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const free = batches.reduce((n, b) => n + b.free, 0);
  const [birds, setBirds] = React.useState(Math.min(1, free));
  const [batchId, setBatchId] = React.useState("");
  const [pricing, setPricing] = React.useState<Pricing>(pricePerKgKobo ? "perKg" : "perBird");
  const [perKg, setPerKg] = React.useState<number | null>(pricePerKgKobo);
  const [perBird, setPerBird] = React.useState<number | null>(null);
  const [kg, setKg] = React.useState("");
  const [who, setWho] = React.useState({ open: false, name: "", phone: "" });
  const [paidBy, setPaidBy] = React.useState<PaidBy>("cash");
  const [collection, setCollection] = React.useState<CollectionView | null>(null);
  const [sold, setSold] = React.useState<QuickSale | null>(null);
  const action = useAction();

  // The last price per bird used on this device: walk-in prices rarely change day to day.
  React.useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(PER_BIRD));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable in the browser
      if (saved > 0) setPerBird(saved);
    } catch {
      // Nothing kept.
    }
  }, []);

  const grams = Math.round(Number(kg || 0) * 1000);
  const price = pricing === "perKg" ? perKg : perBird;
  const total = !price ? 0 : pricing === "perKg" ? Math.round((grams * price) / 1000) : birds * price;
  const limit = batchId ? (batches.find((b) => b.id === batchId)?.free ?? 0) : free;
  const reason =
    birds < 1
      ? "Choose how many birds."
      : birds > limit
        ? `There are ${limit.toLocaleString("en-NG")} birds free.`
        : !price
          ? "Enter the price."
          : pricing === "perKg" && grams < 1
            ? "Weigh the birds and enter their weight."
            : "";

  const sell = () =>
    void action.run(
      () =>
        apiRequest<QuickSale>("/api/sales/quick", "POST", {
          birds,
          batchId: batchId || undefined,
          pricing,
          priceKobo: price,
          weightGrams: pricing === "perKg" ? grams : 0,
          paidBy,
          name: who.name,
          phone: who.phone,
        }),
      {
        onSuccess: (sale) => {
          if (pricing === "perBird" && perBird)
            try {
              window.localStorage.setItem(PER_BIRD, String(perBird));
            } catch {
              // Not kept: typed again next time.
            }
          setSold(sale);
          const what = `${birds.toLocaleString("en-NG")} bird${birds === 1 ? "" : "s"} for ${formatNaira(sale.invoice.totalKobo)}`;
          if (sale.collection) setCollection(sale.collection);
          else
            onDone(
              paidBy === "cash"
                ? `Sold ${what}, paid in cash.`
                : `Sold ${what}: ${sale.invoice.number} is waiting to be paid.`,
            );
        },
      },
    );

  if (collection && sold)
    return (
      <Sheet
        open
        onClose={onClose}
        title="Pay by transfer"
        subtitle={`${sold.invoice.number} · ${formatNaira(collection.amountKobo)}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">Show them this, or read it out. It&apos;s for this sale only.</p>
          <TransferAccount
            collection={collection}
            checkUrl={(id) => `/api/collections/${id}`}
            simulated={simulated}
            onPaid={(c) => onDone(`Paid by transfer: ${formatNaira(c.amountKobo)} for ${c.invoiceNumber}.`)}
            onNew={() =>
              void action.run(() => apiRequest<CollectionView>(`/api/invoices/${sold.invoice.id}/collect`, "POST"), {
                toastError: true,
                onSuccess: setCollection,
              })
            }
          />
          <Button
            variant="ghost"
            fullWidth
            onClick={() =>
              onDone(`${sold.invoice.number} is waiting for the transfer: it's marked paid when it lands.`)
            }
          >
            Close: it&apos;s marked paid when the money lands
          </Button>
        </div>
      </Sheet>
    );

  return (
    <Sheet
      open
      onClose={() => !action.busy && onClose()}
      title="Sell now"
      subtitle="To anyone, paid now or later"
      footer={
        <div className="space-y-2">
          <p className="num flex items-baseline justify-between" aria-live="polite">
            <span className="text-sm text-fg-muted">Total</span>
            <span className="font-display text-2xl font-bold text-fg-heading">{formatNaira(total)}</span>
          </p>
          <ActionFeedback action={action} />
          <Button
            size="lg"
            fullWidth
            loading={action.busy}
            disabled={!!reason}
            reason={reason || undefined}
            onClick={sell}
          >
            {paidBy === "cash"
              ? `Sold: ${formatNaira(total)} cash`
              : paidBy === "transfer"
                ? "Get an account to pay into"
                : "Sold: they'll pay later"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="One bird fewer"
              disabled={birds <= 1}
              onClick={() => setBirds((b) => Math.max(1, b - 1))}
              className="focus-ring grid size-12 shrink-0 place-items-center rounded-full border border-line-strong text-fg disabled:opacity-40 [&_svg]:size-5"
            >
              <Minus />
            </button>
            <label className="block min-w-0 flex-1 text-center">
              <span className="sr-only">Birds</span>
              <input
                size={1}
                inputMode="numeric"
                value={birds ? String(birds) : ""}
                placeholder="0"
                onChange={(e) => setBirds(Number(e.target.value.replace(/\D/g, "").slice(0, 6)) || 0)}
                className="num w-full bg-transparent text-center font-display text-5xl font-bold text-fg-heading outline-none"
              />
              <span className="block text-sm text-fg-muted">{birds === 1 ? "bird" : "birds"}</span>
            </label>
            <button
              type="button"
              aria-label="One bird more"
              disabled={birds >= limit}
              onClick={() => setBirds((b) => Math.min(limit, b + 1))}
              className="focus-ring grid size-12 shrink-0 place-items-center rounded-full border border-line-strong text-fg disabled:opacity-40 [&_svg]:size-5"
            >
              <Plus />
            </button>
          </div>
          {batches.length > 1 ? (
            <Select
              aria-label="From batch"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="text-center"
            >
              <option value="">From the oldest batch ({free.toLocaleString("en-NG")} free)</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} ({b.free.toLocaleString("en-NG")} free)
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-center text-sm text-fg-muted">{free.toLocaleString("en-NG")} free to sell</p>
          )}
        </section>

        <section className="space-y-3">
          <Segmented
            label="Priced"
            className="w-full"
            value={pricing}
            onChange={setPricing}
            options={[
              { value: "perBird", label: "Per bird" },
              { value: "perKg", label: "Per kg" },
            ]}
          />
          <div className={cn("grid gap-3", pricing === "perKg" && "grid-cols-2")}>
            {pricing === "perKg" ? (
              <>
                <Field id="sellKg" label="They weigh (kg)" error={action.fieldError("weightGrams")}>
                  {(a11y) => (
                    <Input
                      {...a11y}
                      inputMode="decimal"
                      className="num"
                      placeholder="4.4"
                      value={kg}
                      onChange={(e) => setKg(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))}
                    />
                  )}
                </Field>
                <Field id="sellPerKg" label="Price a kg" error={action.fieldError("priceKobo")}>
                  {(a11y) => <MoneyInput {...a11y} value={perKg} onChange={setPerKg} placeholder="3,200.00" />}
                </Field>
              </>
            ) : (
              <Field id="sellPerBird" label="Price a bird" error={action.fieldError("priceKobo")}>
                {(a11y) => <MoneyInput {...a11y} value={perBird} onChange={setPerBird} placeholder="7,000.00" />}
              </Field>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <p id="paid-by" className="text-sm font-semibold text-fg">
            How do they pay?
          </p>
          <div role="radiogroup" aria-labelledby="paid-by" className="grid grid-cols-3 gap-2">
            {(
              [
                ["cash", "Cash now", <Banknote key="c" />],
                ["transfer", "Transfer now", <Landmark key="t" />],
                ["later", "Pay later", <Clock key="l" />],
              ] as const
            ).map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={paidBy === value}
                onClick={() => setPaidBy(value)}
                className={cn(
                  "focus-ring flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-sm font-semibold transition-colors [&_svg]:size-5",
                  paidBy === value ? "border-charcoal bg-charcoal text-white" : "border-line bg-surface text-fg",
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          {paidBy === "transfer" && (
            <p className="text-sm text-fg-muted">
              They get a bank account for this sale. It&apos;s marked paid by itself when the money lands.
            </p>
          )}
        </section>

        {who.open ? (
          <section className="grid gap-3 sm:grid-cols-2">
            <Field id="sellName" label="Their name" hint="Optional">
              {(a11y) => (
                <Input
                  {...a11y}
                  value={who.name}
                  maxLength={80}
                  onChange={(e) => setWho((w) => ({ ...w, name: e.target.value }))}
                />
              )}
            </Field>
            <Field
              id="sellPhone"
              label="Their phone"
              hint="Optional: to find them next time"
              error={action.fieldError("phone")}
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  type="tel"
                  inputMode="tel"
                  placeholder="0803 123 4567"
                  value={who.phone}
                  onChange={(e) => setWho((w) => ({ ...w, phone: e.target.value }))}
                />
              )}
            </Field>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setWho((w) => ({ ...w, open: true }))}
            className="focus-ring inline-flex items-center gap-2 rounded text-sm font-semibold text-brand-fg"
          >
            <UserRound className="size-4" aria-hidden /> Add their name or phone (optional)
          </button>
        )}
      </div>
    </Sheet>
  );
}
