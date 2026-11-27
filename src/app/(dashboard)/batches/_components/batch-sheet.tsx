"use client";

import * as React from "react";
import Link from "next/link";
import { useFormik } from "formik";
import { TriangleAlert, Warehouse } from "lucide-react";

import { Field, FormAlert, useFocusFirstError } from "@/components/auth";
import { EmptyState } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import {
  ageOn,
  type BatchInput,
  BREEDS,
  chickCostKobo,
  daysBetween,
  DEFAULTS,
  formatAge,
  paidCount,
  placedCount,
  targetDate,
  validateBatch,
} from "@/lib/batches/rules";
import type { BatchView, PlacementWarning } from "@/lib/batches/service";
import { formatRange } from "@/lib/dates";
import type { HouseView } from "@/lib/houses/service";
import { formatNaira } from "@/lib/money";

const n = (x: number) => x.toLocaleString("en-NG");
const ORDER = [
  "houseId",
  "placedOn",
  "breed",
  "delivered",
  "deadOnArrival",
  "freeExtras",
  "pricePerChickKobo",
  "supplierName",
  "targetSellAgeDays",
  "targetWeightGrams",
  "ageAtPlacementDays",
  "notes",
] as const;

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Places a new batch or edits one, in a bottom sheet on phones. Warnings the server raises (over
 * capacity, a resting house…) show inside the sheet to confirm. A retried submission carries the
 * same request id, so a double tap or a dropped connection never creates two batches.
 */
/** The hatchery isn't a saved supplier: its name is typed in. */
const OTHER = "__other";

export function BatchSheet({
  open,
  onClose,
  onSaved,
  houses,
  today,
  batch,
  canManageHouses,
  hatcheries = [],
}: {
  /** Saved suppliers to pick the hatchery from (chick sellers first). */
  hatcheries?: { id: string; name: string; chicks: boolean }[];
  open: boolean;
  onClose: () => void;
  onSaved: (batch: BatchView, created: boolean) => void;
  houses: HouseView[];
  today: string;
  batch?: BatchView;
  canManageHouses: boolean;
}) {
  const [requestId, setRequestId] = React.useState(newRequestId);
  // How the chicks were paid for, recorded as an expense with a new batch.
  const [paidBy, setPaidBy] = React.useState<"transfer" | "cash" | "pos" | "later">("transfer");
  const [otherHatchery, setOtherHatchery] = React.useState(!batch?.supplierId && !!batch?.supplierName);
  const [warnings, setWarnings] = React.useState<PlacementWarning[] | null>(null);
  const [failure, setFailure] = React.useState<AuthError | null>(null);

  // Each opening starts clean, with a new request id: reset while rendering.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRequestId(newRequestId());
      setWarnings(null);
      setFailure(null);
    }
  }

  const usable = houses.filter((h) => h.status !== "retired" || h.id === batch?.houseId);
  const initial: BatchInput = batch
    ? {
        houseId: batch.houseId,
        placedOn: batch.placedOn,
        breed: batch.breed,
        delivered: batch.delivered,
        deadOnArrival: batch.deadOnArrival,
        freeExtras: batch.freeExtras,
        pricePerChickKobo: batch.pricePerChickKobo,
        supplierName: batch.supplierName,
        supplierId: batch.supplierId ?? null,
        ageAtPlacementDays: batch.ageAtPlacementDays,
        targetSellAgeDays: batch.targetSellAgeDays,
        targetWeightGrams: batch.targetWeightGrams,
        notes: batch.notes,
      }
    : {
        houseId: usable.find((h) => h.status === "active" && h.batchCount === 0)?.id ?? usable[0]?.id ?? "",
        placedOn: today,
        breed: "",
        delivered: Number.NaN,
        deadOnArrival: 0,
        freeExtras: 0,
        pricePerChickKobo: Number.NaN,
        supplierName: "",
        supplierId: null,
        ageAtPlacementDays: 0,
        targetSellAgeDays: DEFAULTS.targetSellAgeDays,
        targetWeightGrams: DEFAULTS.targetWeightGrams,
        notes: "",
      };

  const submit = async (values: BatchInput, confirm: boolean) => {
    setFailure(null);
    try {
      const saved = batch
        ? await apiRequest<BatchView>(`/api/batches/${batch.id}`, "PATCH", {
            ...values,
            version: batch.version,
            confirm,
          })
        : await apiRequest<BatchView>("/api/batches", "POST", { ...values, confirm, requestId, chicksPaidBy: paidBy });
      setWarnings(null);
      onSaved(saved, !batch);
    } catch (e) {
      const error = e as AuthError;
      if (error.code === "needs_confirmation")
        setWarnings((error.details as { warnings: PlacementWarning[] }).warnings);
      else if (error.field) form.setFieldError(error.field, error.message);
      else setFailure(error);
    }
  };

  const form = useFormik<BatchInput>({
    enableReinitialize: true,
    initialValues: initial,
    validate: (values) => validateBatch(values, today),
    onSubmit: (values) => submit(values, false),
  });
  useFocusFirstError(form, ORDER);

  const error = (name: keyof BatchInput) =>
    (form.submitCount > 0 || form.touched[name]) && typeof form.errors[name] === "string"
      ? form.errors[name]
      : undefined;
  const numberField = (name: keyof BatchInput) => ({
    name,
    inputMode: "numeric" as const,
    className: "num",
    value: Number.isFinite(form.values[name] as number) ? String(form.values[name]) : "",
    onBlur: form.handleBlur,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setWarnings(null);
      void form.setFieldValue(name, e.target.value === "" ? Number.NaN : Number(e.target.value.replace(/[,\s]/g, "")));
    },
  });

  const v = form.values;
  const counts = Number.isSafeInteger(v.delivered) && v.delivered > 0;
  const placed = counts ? placedCount(v) : 0;
  const cost = counts && Number.isSafeInteger(v.pricePerChickKobo) ? chickCostKobo(v) : null;
  const age = /^\d{4}-\d{2}-\d{2}$/.test(v.placedOn) ? ageOn(v, today) : null;
  const sellOn = age !== null && Number.isSafeInteger(v.targetSellAgeDays) ? targetDate(v) : null;

  const title = batch ? `Edit ${batch.code}` : "New batch";

  if (!houses.length)
    return (
      <Sheet open={open} onClose={onClose} title={title} subtitle="Chicks go into a house">
        <EmptyState
          icon={<Warehouse />}
          title="Add a house first"
          description={
            canManageHouses
              ? "Batches are placed in houses. Add your houses, with how many birds each holds."
              : "Batches are placed in houses. Ask an owner to add the farm's houses in Settings."
          }
          action={
            canManageHouses ? (
              <Link href="/settings/houses" className="font-semibold text-brand-fg underline">
                Add houses
              </Link>
            ) : undefined
          }
        />
      </Sheet>
    );

  return (
    <Sheet
      open={open}
      onClose={() => !form.isSubmitting && onClose()}
      title={title}
      subtitle={batch ? `${batch.houseName} · ${batch.breed}` : "Chicks placed in a house"}
      footer={
        <div className="space-y-2">
          {counts && (
            <p className="num text-center text-xs text-fg-muted" aria-live="polite">
              {n(placed)} placed
              {cost !== null && (
                <>
                  {" · "}
                  {formatNaira(cost)} for {n(paidCount(v))} paid chick{paidCount(v) === 1 ? "" : "s"}
                </>
              )}
            </p>
          )}
          <Button type="submit" form="batch-form" fullWidth size="lg" loading={form.isSubmitting && !warnings}>
            {batch ? "Save changes" : "Place batch"}
          </Button>
        </div>
      }
    >
      <form id="batch-form" noValidate onSubmit={form.handleSubmit} className="space-y-6">
        {failure && <FormAlert title={failure.message} />}
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
              <Button
                loading={form.isSubmitting}
                onClick={async () => {
                  form.setSubmitting(true);
                  await submit(form.values, true);
                  form.setSubmitting(false);
                }}
              >
                {batch ? "Save anyway" : "Place anyway"}
              </Button>
            </div>
          </div>
        )}

        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-fg-subtle">Where and when</legend>
          <Field id="houseId" label="House" error={error("houseId")}>
            {(a11y) => (
              <Select {...a11y} {...form.getFieldProps("houseId")}>
                {usable.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} — {n(h.occupied)} of {n(h.capacity)} in use
                    {h.status === "maintenance" ? " (maintenance)" : h.status === "retired" ? " (retired)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            id="placedOn"
            label="Placed on"
            error={error("placedOn")}
            hint={
              age === null ? undefined : age < 0 ? (
                <>
                  Planned: arrives in {-age} day{age === -1 ? "" : "s"}.
                </>
              ) : (
                <>{formatAge(age)} today.</>
              )
            }
          >
            {(a11y) => <Input {...a11y} {...form.getFieldProps("placedOn")} type="date" />}
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-fg-subtle">Chicks</legend>
          <Field id="breed" label="Breed" error={error("breed")}>
            {(a11y) => (
              <>
                <Input
                  {...a11y}
                  {...form.getFieldProps("breed")}
                  list="breeds"
                  placeholder="Arbor Acres"
                  autoComplete="off"
                />
                <datalist id="breeds">
                  {BREEDS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field
            id="delivered"
            label="Chicks delivered"
            error={error("delivered")}
            hint="Everything in the boxes, dead or alive."
          >
            {(a11y) => <Input {...a11y} {...numberField("delivered")} placeholder="1000" />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="deadOnArrival" label="Dead on arrival" error={error("deadOnArrival")}>
              {(a11y) => <Input {...a11y} {...numberField("deadOnArrival")} />}
            </Field>
            <Field id="freeExtras" label="Free extras" error={error("freeExtras")} hint="Not charged for">
              {(a11y) => <Input {...a11y} {...numberField("freeExtras")} />}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pricePerChickKobo" label="Price per chick" error={error("pricePerChickKobo")}>
              {(a11y) => (
                <MoneyInput
                  {...a11y}
                  value={Number.isFinite(v.pricePerChickKobo) ? v.pricePerChickKobo : null}
                  onChange={(kobo) => void form.setFieldValue("pricePerChickKobo", kobo ?? Number.NaN)}
                  placeholder="850.00"
                />
              )}
            </Field>
            <Field
              id="supplierId"
              label="Hatchery"
              error={error("supplierId") ?? error("supplierName")}
              hint="Optional"
            >
              {(a11y) =>
                hatcheries.length ? (
                  <Select
                    {...a11y}
                    value={v.supplierId ?? (otherHatchery ? OTHER : "")}
                    onChange={(e) => {
                      const id = e.target.value;
                      const chosen = hatcheries.find((h) => h.id === id);
                      setOtherHatchery(id === OTHER);
                      void form.setValues({
                        ...v,
                        supplierId: chosen ? chosen.id : null,
                        supplierName: chosen ? chosen.name : id === OTHER ? v.supplierName : "",
                      });
                    }}
                  >
                    <option value="">Not saying</option>
                    {[...hatcheries]
                      .sort((a, b) => Number(b.chicks) - Number(a.chicks) || a.name.localeCompare(b.name))
                      .map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    <option value={OTHER}>Someone else…</option>
                  </Select>
                ) : (
                  <Input {...a11y} {...form.getFieldProps("supplierName")} placeholder="Amo Byng" maxLength={80} />
                )
              }
            </Field>
          </div>
          {hatcheries.length > 0 && !v.supplierId && otherHatchery && (
            <Field id="supplierName" label="Hatchery's name" error={error("supplierName")}>
              {(a11y) => (
                <Input {...a11y} {...form.getFieldProps("supplierName")} placeholder="Amo Byng" maxLength={80} />
              )}
            </Field>
          )}
          {!batch && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg">The chicks: paid for?</p>
              <Segmented
                label="The chicks: paid for?"
                className="w-full"
                value={paidBy === "later" ? "later" : "paid"}
                onChange={(next) => setPaidBy(next === "later" ? "later" : "transfer")}
                options={[
                  { value: "paid", label: "Paid already" },
                  { value: "later", label: "Owed to the hatchery" },
                ]}
              />
              {paidBy !== "later" && (
                <Select
                  aria-label="Paid by"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value as typeof paidBy)}
                >
                  <option value="transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="pos">POS</option>
                </Select>
              )}
              <p className="text-xs text-fg-muted">
                Recorded under Expenses as the batch&apos;s chicks.
                {paidBy === "later" ? " An owner can pay the hatchery from there." : ""}
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-fg-subtle">Targets</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="targetSellAgeDays"
              label="Sell at (days)"
              error={error("targetSellAgeDays")}
              hint={
                sellOn && Number.isSafeInteger(v.targetSellAgeDays) ? (
                  <>
                    {Math.round((v.targetSellAgeDays / 7) * 10) / 10} weeks ·{" "}
                    {formatRange({ from: sellOn, to: sellOn })}
                  </>
                ) : undefined
              }
            >
              {(a11y) => <Input {...a11y} {...numberField("targetSellAgeDays")} />}
            </Field>
            <Field id="targetWeightGrams" label="Target weight (kg)" error={error("targetWeightGrams")}>
              {(a11y) => (
                <Input
                  {...a11y}
                  name="targetWeightGrams"
                  inputMode="decimal"
                  className="num"
                  value={Number.isFinite(v.targetWeightGrams) ? String(v.targetWeightGrams / 1000) : ""}
                  onBlur={form.handleBlur}
                  onChange={(e) =>
                    void form.setFieldValue(
                      "targetWeightGrams",
                      e.target.value === "" ? Number.NaN : Math.round(Number(e.target.value) * 1000),
                    )
                  }
                />
              )}
            </Field>
          </div>
          <details className="group rounded-xl border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-fg-muted">Chicks older than a day?</summary>
            <div className="pt-3">
              <Field
                id="ageAtPlacementDays"
                label="Age when placed (days)"
                error={error("ageAtPlacementDays")}
                hint="0 for day-old chicks. Ages and targets count from this."
              >
                {(a11y) => <Input {...a11y} {...numberField("ageAtPlacementDays")} />}
              </Field>
            </div>
          </details>
        </fieldset>

        <Field id="notes" label="Notes" error={error("notes")} hint="Optional">
          {(a11y) => <Textarea {...a11y} {...form.getFieldProps("notes")} rows={2} maxLength={500} />}
        </Field>
        {batch && sellOn && daysBetween(today, sellOn) < 0 && batch.phase !== "selling" && (
          <p className="text-xs text-fg-subtle">This batch is past its target sell age.</p>
        )}
      </form>
    </Sheet>
  );
}
