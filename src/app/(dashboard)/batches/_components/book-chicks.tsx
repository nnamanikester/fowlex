"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, HandCoins, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { DEFAULTS, placedCount } from "@/lib/batches/rules";
import type { BatchView, PlacementWarning } from "@/lib/batches/service";
import { addDays, formatRange } from "@/lib/dates";
import type { HouseView } from "@/lib/houses/service";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

export type Hatchery = { id: string; name: string; chicks: boolean; payable: boolean };
type PaidBy = "transfer" | "cash" | "pos" | "later" | "paystack";

const n = (x: number) => x.toLocaleString("en-NG");
const day = (d: string) =>
  new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );
const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Booking chicks, the way the farm buys them: paid up front, picked up two or three days later.
 * Asks only what's known when booking, starts from the last booking's hatchery, price and breed,
 * and records the payment as the chicks' expense. Paying through Paystack goes straight on to it.
 */
export function BookChicksSheet({
  houses,
  hatcheries,
  last,
  today,
  canPay,
  onClose,
}: {
  houses: HouseView[];
  hatcheries: Hatchery[];
  /** The latest batch, to start from its hatchery, price and breed. */
  last: BatchView | null;
  today: string;
  canPay: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const usable = houses.filter((h) => h.status !== "retired");
  const [hatchery, setHatchery] = React.useState(
    last?.supplierId && hatcheries.some((h) => h.id === last.supplierId)
      ? last.supplierId
      : (hatcheries.find((h) => h.chicks)?.id ?? ""),
  );
  const [hatcheryName, setHatcheryName] = React.useState(last && !last.supplierId ? last.supplierName : "");
  const [count, setCount] = React.useState("");
  const [price, setPrice] = React.useState<number | null>(last?.pricePerChickKobo ?? null);
  const [pickupOn, setPickupOn] = React.useState(addDays(today, 2));
  const [houseId, setHouseId] = React.useState(
    usable.find((h) => h.status === "active" && h.batchCount === 0)?.id ?? usable[0]?.id ?? "",
  );
  const [breed, setBreed] = React.useState(last?.breed ?? "");
  const [paidBy, setPaidBy] = React.useState<PaidBy>("transfer");
  const [warnings, setWarnings] = React.useState<PlacementWarning[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const [requestId] = React.useState(newRequestId);

  const chosen = hatcheries.find((h) => h.id === hatchery);
  const payable = canPay && !!chosen?.payable;
  const how: PaidBy = paidBy === "paystack" && !payable ? "transfer" : paidBy;
  const chicks = Number(count);
  const total = chicks > 0 && price !== null ? chicks * price : null;
  const error = (f: string) => (failure?.field === f ? failure.message : undefined);

  const book = async (confirm = false) => {
    setFailure(null);
    setBusy(true);
    try {
      const saved = await apiRequest<BatchView>("/api/batches", "POST", {
        booking: true,
        houseId,
        placedOn: pickupOn,
        breed,
        delivered: count === "" ? Number.NaN : chicks,
        deadOnArrival: 0,
        freeExtras: 0,
        pricePerChickKobo: price ?? Number.NaN,
        supplierId: hatchery || null,
        supplierName: hatchery ? (chosen?.name ?? "") : hatcheryName,
        ageAtPlacementDays: 0,
        targetSellAgeDays: DEFAULTS.targetSellAgeDays,
        targetWeightGrams: DEFAULTS.targetWeightGrams,
        notes: "",
        chicksPaidBy: how === "paystack" ? "later" : how,
        confirm,
        requestId,
      });
      toast.success(`${saved.code} booked: ${n(chicks)} chicks to pick up ${day(pickupOn)}.`);
      router.refresh();
      onClose();
      // Paying now through Paystack: straight on to it.
      if (how === "paystack" && saved.chickExpense) router.push(`/expenses?open=${saved.chickExpense.id}&pay=1`);
    } catch (e) {
      const err = e as AuthError;
      if (err.code === "needs_confirmation") setWarnings((err.details as { warnings: PlacementWarning[] }).warnings);
      else setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Book chicks"
      subtitle="Paid now, picked up later"
      footer={
        <div className="space-y-2">
          <ActionFeedback action={{ failure }} />
          <p className="num flex items-baseline justify-between text-sm" aria-live="polite">
            <span className="text-fg-muted">{chicks > 0 ? `${n(chicks)} chicks` : "Total"}</span>
            <span className="text-lg font-semibold text-fg">{total === null ? "–" : formatNaira(total)}</span>
          </p>
          <Button size="lg" fullWidth loading={busy && !warnings} onClick={() => void book()}>
            {how === "paystack" ? (
              <>
                <Send /> Book, then pay
              </>
            ) : (
              "Book chicks"
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {warnings && (
          <div role="alert" className="space-y-3 rounded-xl border border-warning-line bg-warning-subtle p-4">
            <p className="flex items-center gap-2 font-bold text-warning-fg">
              <TriangleAlert className="size-4" aria-hidden /> Check before going ahead
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg">
              {warnings.map((w) => (
                <li key={w.code}>{w.message}</li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setWarnings(null)}>
                Change details
              </Button>
              <Button loading={busy} onClick={() => void book(true)}>
                Book anyway
              </Button>
            </div>
          </div>
        )}

        <Field id="supplierId" label="Hatchery" error={error("supplierId") ?? error("supplierName")}>
          {(a11y) =>
            hatcheries.length ? (
              <Select {...a11y} value={hatchery} onChange={(e) => setHatchery(e.target.value)}>
                {[...hatcheries]
                  .sort((a, b) => Number(b.chicks) - Number(a.chicks) || a.name.localeCompare(b.name))
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                <option value="">Someone else…</option>
              </Select>
            ) : (
              <Input
                {...a11y}
                value={hatcheryName}
                maxLength={80}
                placeholder="Amo Byng"
                onChange={(e) => setHatcheryName(e.target.value)}
              />
            )
          }
        </Field>
        {hatcheries.length > 0 && !hatchery && (
          <Field id="supplierName" label="Hatchery's name" error={error("supplierName")}>
            {(a11y) => (
              <Input
                {...a11y}
                value={hatcheryName}
                maxLength={80}
                placeholder="Amo Byng"
                onChange={(e) => setHatcheryName(e.target.value)}
              />
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field id="delivered" label="How many chicks" error={error("delivered")}>
            {(a11y) => (
              <Input
                {...a11y}
                inputMode="numeric"
                className="num"
                placeholder="1,000"
                value={count}
                onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
              />
            )}
          </Field>
          <Field id="pricePerChickKobo" label="Price per chick" error={error("pricePerChickKobo")}>
            {(a11y) => <MoneyInput {...a11y} value={price} onChange={setPrice} placeholder="850.00" />}
          </Field>
        </div>

        <div className="space-y-2">
          <Field id="placedOn" label="Pick up on" error={error("placedOn")} hint={day(pickupOn)}>
            {(a11y) => (
              <Input
                {...a11y}
                type="date"
                value={pickupOn}
                onChange={(e) => e.target.value && setPickupOn(e.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick pickup days">
            {[
              [1, "Tomorrow"],
              [2, "In 2 days"],
              [3, "In 3 days"],
            ].map(([d, label]) => (
              <button
                key={d}
                type="button"
                onClick={() => setPickupOn(addDays(today, d as number))}
                aria-pressed={pickupOn === addDays(today, d as number)}
                className={cn(
                  "focus-ring rounded-full border px-3 py-1.5 text-sm font-medium",
                  pickupOn === addDays(today, d as number)
                    ? "border-brand bg-brand-subtle text-brand-fg"
                    : "border-line bg-surface text-fg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="houseId" label="Into house" error={error("houseId")}>
            {(a11y) => (
              <Select {...a11y} value={houseId} onChange={(e) => setHouseId(e.target.value)}>
                {usable.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                    {h.batchCount ? " (in use)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="breed" label="Breed" error={error("breed")}>
            {(a11y) => (
              <Input
                {...a11y}
                value={breed}
                maxLength={40}
                placeholder="Ross 308"
                onChange={(e) => setBreed(e.target.value)}
              />
            )}
          </Field>
        </div>

        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-semibold text-fg">Paying for them</legend>
          <div role="radiogroup" aria-label="Paying for them" className="grid gap-2">
            <Choice
              checked={how !== "later" && how !== "paystack"}
              onSelect={() => setPaidBy("transfer")}
              icon={<CircleCheck />}
              title="Paid already"
              detail="By bank transfer, cash or POS"
            />
            {canPay && (
              <Choice
                checked={how === "paystack"}
                disabled={!payable}
                onSelect={() => setPaidBy("paystack")}
                icon={<Send />}
                title="Pay now with Paystack"
                detail={
                  payable ? `To ${chosen!.name}'s account. You confirm next.` : "Choose a hatchery with a bank account."
                }
              />
            )}
            <Choice
              checked={how === "later"}
              onSelect={() => setPaidBy("later")}
              icon={<HandCoins />}
              title="Pay later"
              detail="Shows as owed to the hatchery"
            />
          </div>
          {how !== "later" && how !== "paystack" && (
            <Segmented
              label="Paid by"
              className="w-full"
              value={how}
              onChange={(v) => setPaidBy(v)}
              options={[
                { value: "transfer", label: "Transfer" },
                { value: "cash", label: "Cash" },
                { value: "pos", label: "POS" },
              ]}
            />
          )}
        </fieldset>
      </div>
    </Sheet>
  );
}

/**
 * Booked chicks collected and put in the house: how many came, the house and the day, all filled
 * in from the booking. Fewer than paid for is shown as the hatchery's shortfall.
 */
export function PickUpSheet({
  batch,
  houses,
  today,
  onClose,
}: {
  batch: BatchView;
  houses: HouseView[];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const booked = batch.bookedChicks ?? batch.delivered - batch.freeExtras;
  const [delivered, setDelivered] = React.useState(String(booked));
  const [doa, setDoa] = React.useState("0");
  const [extras, setExtras] = React.useState("0");
  const [houseId, setHouseId] = React.useState(batch.houseId);
  const [on, setOn] = React.useState(batch.placedOn < today ? batch.placedOn : today);
  const [warnings, setWarnings] = React.useState<PlacementWarning[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const num = (s: string) => (s === "" ? 0 : Number(s));
  const placed = placedCount({ delivered: num(delivered), deadOnArrival: num(doa) });
  const short = Math.max(0, booked - (num(delivered) - num(extras)));

  const save = async (confirm = false) => {
    setBusy(true);
    setFailure(null);
    try {
      const saved = await apiRequest<BatchView>(`/api/batches/${batch.id}/pickup`, "POST", {
        delivered: num(delivered),
        deadOnArrival: num(doa),
        freeExtras: num(extras),
        houseId,
        pickedUpOn: on,
        version: batch.version,
        confirm,
      });
      toast.success(
        `${saved.code} is in ${saved.houseName}: ${n(saved.placed)} birds.` +
          (saved.shortfall ? ` ${saved.supplierName || "The hatchery"} owes you ${n(saved.shortfall)} chicks.` : ""),
      );
      router.refresh();
      onClose();
    } catch (e) {
      const err = e as AuthError;
      if (err.code === "needs_confirmation") setWarnings((err.details as { warnings: PlacementWarning[] }).warnings);
      else setFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const counter = (id: string, label: string, value: string, set: (v: string) => void, hint?: string) => (
    <Field id={id} label={label} error={failure?.field === id ? failure.message : undefined} hint={hint}>
      {(a11y) => (
        <Input
          {...a11y}
          inputMode="numeric"
          className="num"
          value={value}
          onChange={(e) => set(e.target.value.replace(/\D/g, ""))}
        />
      )}
    </Field>
  );

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Chicks picked up"
      subtitle={`${batch.code} · ${n(booked)} paid for${batch.supplierName ? ` from ${batch.supplierName}` : ""}`}
      footer={
        <div className="space-y-2">
          <ActionFeedback action={{ failure }} />
          <Button size="lg" fullWidth loading={busy && !warnings} onClick={() => void save()}>
            Put {n(placed)} in the house
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {warnings && (
          <div role="alert" className="space-y-3 rounded-xl border border-warning-line bg-warning-subtle p-4 text-sm">
            <ul className="list-disc space-y-1.5 pl-5 text-fg">
              {warnings.map((w) => (
                <li key={w.code}>{w.message}</li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setWarnings(null)}>
                Change details
              </Button>
              <Button loading={busy} onClick={() => void save(true)}>
                Place anyway
              </Button>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {counter("delivered", "How many came", delivered, setDelivered)}
          {counter("deadOnArrival", "Dead on arrival", doa, setDoa)}
          {counter("freeExtras", "Free extras", extras, setExtras)}
        </div>
        {short > 0 && (
          <p className="rounded-xl border border-warning-line bg-warning-subtle px-3 py-2.5 text-sm text-fg">
            That&apos;s {n(short)} fewer than you paid for: {batch.supplierName || "the hatchery"} owes you {n(short)}{" "}
            chicks. What you paid stays as it was.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field id="houseId" label="Into house">
            {(a11y) => (
              <Select {...a11y} value={houseId} onChange={(e) => setHouseId(e.target.value)}>
                {houses
                  .filter((h) => h.status !== "retired" || h.id === batch.houseId)
                  .map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field
            id="pickedUpOn"
            label="Picked up on"
            error={failure?.field === "pickedUpOn" ? failure.message : undefined}
          >
            {(a11y) => <Input {...a11y} type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} />}
          </Field>
        </div>
        <p className="text-sm text-fg-muted">
          The batch starts {on === today ? "today" : formatRange({ from: on, to: on })}: its age, vaccinations and daily
          logs count from then.
        </p>
      </div>
    </Sheet>
  );
}

function Choice({
  checked,
  disabled,
  onSelect,
  icon,
  title,
  detail,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onSelect()}
      className={cn(
        "focus-ring flex items-start gap-3 rounded-xl border p-3 text-left",
        checked ? "border-brand bg-brand-subtle" : "border-line bg-surface",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className={cn("mt-0.5 [&_svg]:size-5", checked ? "text-brand-fg" : "text-fg-subtle")}>{icon}</span>
      <span>
        <span className="block font-semibold text-fg">{title}</span>
        <span className="block text-sm text-fg-muted">{detail}</span>
      </span>
    </button>
  );
}
