"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { PricingSwitch } from "./sell-now-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { defaultName, MAX_PRICES, type PriceDraft, type PriceOption, validatePrices } from "@/lib/shop/prices";
import { cn } from "@/lib/utils";

export const draftsOf = (prices: PriceOption[]): PriceDraft[] =>
  prices.length ? prices.map((p) => ({ ...p })) : [{ name: "", pricing: "perBird", priceKobo: null }];

/** Whether the drafts differ from what's saved. */
export const changed = (drafts: PriceDraft[], saved: PriceOption[]) =>
  JSON.stringify(drafts.map(({ name, pricing, priceKobo }) => [name.trim(), pricing, priceKobo])) !==
  JSON.stringify(saved.map(({ name, pricing, priceKobo }) => [name, pricing, priceKobo]));

/** The first thing wrong with the drafts, said for a disabled button's tooltip. */
export const problem = (drafts: PriceDraft[]) => Object.values(validatePrices(drafts))[0] ?? "";

/**
 * The farm's prices, edited in place: each a name, per bird or per kg, and the amount. Most farms
 * need one ("Live bird, ₦7,000 a bird"); more when birds go at different prices (big and small,
 * or by weight for some buyers). The first is the usual one.
 */
export function PriceList({
  drafts,
  onChange,
  errorFor,
  disabled,
}: {
  drafts: PriceDraft[];
  onChange: (next: PriceDraft[]) => void;
  /** The server's error for a field ("prices.0.priceKobo"), if any. */
  errorFor: (field: string) => string | undefined;
  disabled?: boolean;
}) {
  const set = (i: number, change: Partial<PriceDraft>) =>
    onChange(drafts.map((d, j) => (j === i ? { ...d, ...change } : d)));
  const many = drafts.length > 1;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {drafts.map((d, i) => {
          const error = errorFor(`prices.${i}.priceKobo`) ?? errorFor(`prices.${i}.name`);
          return (
            <li
              key={d.id ?? `new-${i}`}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto_10rem_auto] sm:items-center",
                error ? "border-danger-line" : "border-line",
              )}
            >
              <label className="min-w-0">
                <span className="sr-only">Name of price {i + 1}</span>
                <Input
                  value={d.name}
                  maxLength={40}
                  disabled={disabled}
                  placeholder={many ? (i === 0 ? "Live bird" : "Big bird") : defaultName(d.pricing)}
                  onChange={(e) => set(i, { name: e.target.value })}
                  className="font-semibold"
                />
              </label>
              <PricingSwitch value={d.pricing} onChange={(pricing) => set(i, { pricing })} />
              <label className="col-span-2 min-w-0 sm:col-span-1">
                <span className="sr-only">
                  {many ? `Price ${i + 1}` : "Your price"}, {d.pricing === "perKg" ? "a kg" : "a bird"}
                </span>
                <MoneyInput
                  value={d.priceKobo}
                  disabled={disabled}
                  onChange={(priceKobo) => set(i, { priceKobo })}
                  placeholder={d.pricing === "perKg" ? "3,200 a kg" : "7,000 a bird"}
                  aria-invalid={error ? true : undefined}
                />
              </label>
              {many ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${d.name || `price ${i + 1}`}`}
                  onClick={() => onChange(drafts.filter((_, j) => j !== i))}
                  className="focus-ring col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg text-sm text-fg-subtle hover:bg-danger-subtle hover:text-danger-fg sm:col-span-1 sm:size-10 [&_svg]:size-4"
                >
                  <Trash2 aria-hidden />
                  <span className="sm:sr-only">Remove</span>
                </button>
              ) : (
                <span className="hidden sm:block sm:size-10" aria-hidden />
              )}
              {error && <p className="col-span-full text-sm font-medium text-danger-fg">{error}</p>}
            </li>
          );
        })}
      </ul>
      {drafts.length < MAX_PRICES && (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...drafts,
              { name: "", pricing: drafts[drafts.length - 1]?.pricing ?? "perBird", priceKobo: null },
            ])
          }
          className="focus-ring inline-flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-semibold text-brand-fg"
        >
          <Plus className="size-4" aria-hidden />
          {many ? "Add another price" : "Birds at another price? Add one"}
        </button>
      )}
    </div>
  );
}
