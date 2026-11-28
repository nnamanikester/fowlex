"use client";

import * as React from "react";
import { Banknote, Check, Clock, Landmark, UserRound, X } from "lucide-react";

import { Field } from "@/components/auth";
import { TransferAccount } from "@/components/payments/transfer-account";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { apiRequest } from "@/lib/auth/client";
import type { CollectionView } from "@/lib/collections/service";
import type { Pricing } from "@/lib/contracts/rules";
import { formatNaira } from "@/lib/money";
import type { QuickSale } from "@/lib/sales/quick";
import { type PriceOption, priceLabel } from "@/lib/shop/prices";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

type PaidBy = "cash" | "transfer" | "later";
const PER_BIRD = "fowlex.sell.perBird";
const QUICK = [1, 2, 5, 10, 20];

/** Whole naira when there are no kobo: ₦14,000 reads faster than ₦14,000.00. */
const naira = (kobo: number) => (kobo % 100 ? formatNaira(kobo) : formatNaira(kobo).replace(/\.00$/, ""));

const PAYS: { value: PaidBy; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: "cash", label: "Cash now", hint: "Marked paid", icon: <Banknote /> },
  { value: "transfer", label: "Transfer now", hint: "An account for this sale", icon: <Landmark /> },
  { value: "later", label: "Pay later", hint: "The invoice waits", icon: <Clock /> },
];

/**
 * Selling over the counter, for anyone, in one sheet that reads like a receipt: how many birds,
 * the price, how they pay, the total. Their name or phone is optional. Cash is recorded at once;
 * Transfer turns the sheet into a bank slip that becomes Paid when the money lands; Later leaves
 * the invoice to pay.
 */
export function SellNowSheet({
  batches,
  prices = [],
  simulated,
  onClose,
  onDone,
}: {
  /** `birdGrams`: a bird's weight there (last weighing or target), for a sale not weighed. */
  batches: { id: string; code: string; free: number; birdGrams?: number }[];
  /** The farm's prices, the usual one first: one tap each. */
  prices?: PriceOption[];
  simulated: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const free = batches.reduce((n, b) => n + b.free, 0);
  const [birds, setBirds] = React.useState(Math.min(1, free));
  const [batchId, setBatchId] = React.useState("");
  const [choosingBatch, setChoosingBatch] = React.useState(false);
  const usual = prices[0];
  const [pricing, setPricing] = React.useState<Pricing>(usual?.pricing ?? "perBird");
  const [perKg, setPerKg] = React.useState<number | null>(prices.find((p) => p.pricing === "perKg")?.priceKobo ?? null);
  const [perBird, setPerBird] = React.useState<number | null>(
    prices.find((p) => p.pricing === "perBird")?.priceKobo ?? null,
  );
  const [kg, setKg] = React.useState("");
  const [who, setWho] = React.useState({ open: false, name: "", phone: "" });
  const [paidBy, setPaidBy] = React.useState<PaidBy>("cash");
  const [collection, setCollection] = React.useState<CollectionView | null>(null);
  const [sold, setSold] = React.useState<QuickSale | null>(null);
  const action = useAction();

  // Without a price list, the last price per bird used on this device: walk-in prices rarely change.
  React.useEffect(() => {
    if (usual) return;
    try {
      const saved = Number(window.localStorage.getItem(PER_BIRD));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable in the browser
      if (saved > 0) setPerBird(saved);
    } catch {
      // Nothing kept.
    }
  }, [usual]);

  const weighed = Math.round(Number(kg || 0) * 1000);
  const price = pricing === "perKg" ? perKg : perBird;
  const chosen = prices.find((p) => p.pricing === pricing && p.priceKobo === price);
  const pick = (p: PriceOption) => {
    setPricing(p.pricing);
    if (p.pricing === "perKg") setPerKg(p.priceKobo);
    else setPerBird(p.priceKobo);
  };
  const batch = batches.find((b) => b.id === batchId);
  // Not weighed: the batch's weight a bird (the oldest batch's, when none is chosen), as the sale is priced.
  const estimate = Math.round((batch ?? batches[0])?.birdGrams ?? 0) * birds;
  const grams = weighed || estimate;
  const total = !price ? 0 : pricing === "perKg" ? Math.round((grams * price) / 1000) : birds * price;
  const limit = batch ? batch.free : free;
  const reason =
    birds < 1
      ? "Choose how many birds."
      : birds > limit
        ? `There are ${limit.toLocaleString("en-NG")} birds free.`
        : !price
          ? "Enter the price."
          : "";
  const sum =
    !price || !birds
      ? "Add the price to see the total"
      : pricing === "perKg"
        ? weighed
          ? `${Number(kg).toLocaleString("en-NG")} kg × ${naira(price)}`
          : `About ${(Math.round(grams / 100) / 10).toLocaleString("en-NG")} kg × ${naira(price)}, not weighed`
        : `${birds.toLocaleString("en-NG")} × ${naira(price)}`;

  const sell = () =>
    void action.run(
      () =>
        apiRequest<QuickSale>("/api/sales/quick", "POST", {
          birds,
          batchId: batchId || undefined,
          pricing,
          priceKobo: price,
          // Left empty, the farm prices it on the batch's weight.
          weightGrams: pricing === "perKg" ? weighed : 0,
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
          const what = `${birds.toLocaleString("en-NG")} bird${birds === 1 ? "" : "s"} for ${naira(sale.invoice.totalKobo)}`;
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

  if (collection && sold) {
    const leave = () => onDone(`${sold.invoice.number} is waiting for the transfer: it's marked paid when it lands.`);
    return (
      <Sheet
        key="pay"
        open
        onClose={leave}
        title="Pay by transfer"
        subtitle="Show them this screen, or send them the details"
        footer={
          <Button variant="ghost" fullWidth onClick={leave}>
            Done for now: it turns paid by itself
          </Button>
        }
      >
        <TransferAccount
          collection={collection}
          checkUrl={(id) => `/api/collections/${id}`}
          simulated={simulated}
          onPaid={(c) => onDone(`Paid by transfer: ${naira(c.amountKobo)} for ${c.invoiceNumber}.`)}
          onNew={() =>
            void action.run(() => apiRequest<CollectionView>(`/api/invoices/${sold.invoice.id}/collect`, "POST"), {
              toastError: true,
              onSuccess: setCollection,
            })
          }
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      key="sale"
      open
      onClose={() => !action.busy && onClose()}
      title="Sell now"
      subtitle="To anyone: no details needed"
      footer={
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-4" aria-live="polite">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-fg">Total</p>
              <p className="num truncate text-sm text-fg-muted">{sum}</p>
            </div>
            <p className="num shrink-0 text-3xl font-bold tracking-tight text-fg-heading">{naira(total)}</p>
          </div>
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
              ? `Sold: ${naira(total)} cash`
              : paidBy === "transfer"
                ? "Get an account to pay into"
                : "Sold: they'll pay later"}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* How many: the one big thing on the sheet. */}
        <section aria-label="How many birds" className="space-y-3">
          <Field id="sellBirds" label="Birds">
            {(a11y) => (
              <Stepper
                id={a11y.id}
                label="Bird"
                value={birds}
                min={1}
                onChange={(n) => setBirds(Math.min(n, 999_999))}
              />
            )}
          </Field>
          <div role="group" aria-label="Quick amounts" className="flex flex-wrap gap-2">
            {QUICK.filter((q) => q <= limit).map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={birds === q}
                onClick={() => setBirds(q)}
                className={cn(
                  "focus-ring num min-h-9 min-w-11 rounded-lg border px-3 text-sm font-semibold transition-colors",
                  birds === q
                    ? "border-fg-heading bg-fg-heading text-surface"
                    : "border-line-strong bg-surface text-fg hover:border-fg-subtle",
                )}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="text-sm">
            {choosingBatch && batches.length > 1 ? (
              <div className="flex max-w-sm items-center gap-2">
                <Select
                  aria-label="From batch"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">The oldest batch first ({free.toLocaleString("en-NG")} free)</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} ({b.free.toLocaleString("en-NG")} free)
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  aria-label="Done choosing"
                  onClick={() => setChoosingBatch(false)}
                  className="focus-ring grid size-10 shrink-0 place-items-center rounded-lg text-fg-subtle hover:bg-surface-muted"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <p className={birds > limit ? "font-medium text-danger-fg" : "text-fg-muted"}>
                {birds > limit ? `Only ${limit.toLocaleString("en-NG")} free` : `${limit.toLocaleString("en-NG")} free`}{" "}
                {batch ? `in ${batch.code}` : "to sell"}
                {batches.length > 1 && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setChoosingBatch(true)}
                      className="focus-ring rounded font-semibold text-brand-fg underline-offset-4 hover:underline"
                    >
                      Choose batch
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </section>

        {/* The price, per bird or per kg. */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-fg">Price</h3>
            <PricingSwitch value={pricing} onChange={setPricing} />
          </div>
          {prices.length > 0 && (
            <div role="radiogroup" aria-label="Your prices" className="grid gap-2 sm:flex sm:flex-wrap">
              {prices.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen?.id === p.id}
                  onClick={() => pick(p)}
                  className={cn(
                    "focus-ring flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3.5 text-left text-sm transition-colors sm:inline-flex sm:justify-start",
                    chosen?.id === p.id
                      ? "border-fg-heading bg-fg-heading text-surface"
                      : "border-line-strong bg-surface text-fg hover:border-fg-subtle",
                  )}
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className={cn("num", chosen?.id === p.id ? "text-surface/75" : "text-fg-muted")}>
                    {priceLabel(p)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {pricing === "perKg" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field
                id="sellKg"
                label="They weigh (kg)"
                hint={weighed ? undefined : "Optional"}
                error={action.fieldError("weightGrams")}
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    inputMode="decimal"
                    className="num"
                    placeholder={
                      estimate ? `About ${(Math.round(estimate / 100) / 10).toLocaleString("en-NG")}` : "4.4"
                    }
                    value={kg}
                    onChange={(e) => setKg(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))}
                  />
                )}
              </Field>
              <Field id="sellPerKg" label="Price a kg" error={action.fieldError("priceKobo")}>
                {(a11y) => <MoneyInput {...a11y} value={perKg} onChange={setPerKg} placeholder="3,200.00" />}
              </Field>
            </div>
          ) : (
            <Field id="sellPerBird" label="Price a bird" error={action.fieldError("priceKobo")}>
              {(a11y) => <MoneyInput {...a11y} value={perBird} onChange={setPerBird} placeholder="7,000.00" />}
            </Field>
          )}
        </section>

        {/* How they pay. */}
        <section className="space-y-3">
          <h3 id="paid-by" className="text-sm font-semibold text-fg">
            How do they pay?
          </h3>
          <div role="radiogroup" aria-labelledby="paid-by" className="grid grid-cols-3 gap-2 sm:gap-3">
            {PAYS.map((p) => {
              const on = paidBy === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPaidBy(p.value)}
                  className={cn(
                    "focus-ring relative flex min-h-24 flex-col items-start gap-2.5 rounded-xl border bg-surface p-3 text-left shadow-button transition-[border-color,box-shadow]",
                    on
                      ? "border-fg-heading shadow-[0_0_0_1px_rgb(var(--fg-heading))]"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-lg transition-colors [&_svg]:size-4",
                      on ? "bg-fg-heading text-surface" : "bg-surface-subtle text-fg-muted",
                    )}
                    aria-hidden
                  >
                    {p.icon}
                  </span>
                  <span className="block">
                    <span className="block text-sm font-semibold leading-tight text-fg-heading">{p.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-fg-muted">{p.hint}</span>
                  </span>
                  {on && (
                    <span
                      className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-fg-heading text-surface motion-safe:animate-pop-in"
                      aria-hidden
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Who: never needed, there if they want it. */}
        {who.open ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Who is buying</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="sellName" label="Their name" hint="Optional">
                {(a11y) => (
                  <Input
                    {...a11y}
                    value={who.name}
                    maxLength={80}
                    autoComplete="off"
                    onChange={(e) => setWho((w) => ({ ...w, name: e.target.value }))}
                  />
                )}
              </Field>
              <Field
                id="sellPhone"
                label="Their phone"
                hint="Optional: finds them next time"
                error={action.fieldError("phone")}
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="0803 123 4567"
                    value={who.phone}
                    onChange={(e) => setWho((w) => ({ ...w, phone: e.target.value }))}
                  />
                )}
              </Field>
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setWho((w) => ({ ...w, open: true }))}
            className="focus-ring flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong p-3.5 text-left transition-colors hover:bg-surface-subtle"
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-subtle text-fg-muted"
              aria-hidden
            >
              <UserRound className="size-5" />
            </span>
            <span className="min-w-0 space-y-0.5">
              <span className="block text-sm font-semibold text-fg-heading">Add their name or phone (optional)</span>
              <span className="block text-xs text-fg-muted">
                Skip it for a walk-in: the sale goes through either way
              </span>
            </span>
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** Per bird or per kg: two halves of one switch. */
export function PricingSwitch({ value, onChange }: { value: Pricing; onChange: (p: Pricing) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Priced"
      className="grid grid-cols-2 rounded-xl border border-line bg-surface-subtle p-1 text-sm font-semibold"
    >
      {(
        [
          ["perBird", "Per bird"],
          ["perKg", "Per kg"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "focus-ring min-h-9 whitespace-nowrap rounded-lg px-4 transition-colors",
            value === v ? "bg-surface text-fg-heading shadow-card" : "text-fg-muted hover:text-fg",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
