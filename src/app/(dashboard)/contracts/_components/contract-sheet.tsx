"use client";

import * as React from "react";
import { CircleCheck, FileText, Trash2, X } from "lucide-react";

import { Field } from "@/components/auth";
import { ConfirmDialog } from "@/components/kit";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { apiRequest } from "@/lib/auth/client";
import {
  type ContractInput,
  DELIVERY_EVERY,
  DELIVERY_LABELS,
  type DeliveryEvery,
  endAfter,
  type MinPer,
  PER_UNIT,
  type Pricing,
  PRICING_LABELS,
  STATUS_LABELS,
  validateContract,
} from "@/lib/contracts/rules";
import type { ContractView, TemplateView } from "@/lib/contracts/service";
import { formatRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { uploadReceipt } from "@/lib/upload-client";
import { useAction } from "@/lib/use-action";

export const STATUS_TONE = { draft: "neutral", active: "success", expired: "neutral", terminated: "warning" } as const;
const LENGTHS = [3, 6, 12];
const day = (d: string) => formatRange({ from: d, to: d });

type CustomerOption = { id: string; name: string; termsDays: number };

/**
 * Writes or opens a contract. A new one can start from a template (one tap fills the price,
 * minimum, deliveries and terms) and is saved as a draft or made active at once. A running one
 * can be changed or ended early; an ended one is shown as it was agreed.
 */
export function ContractSheet({
  contract,
  customers,
  customerId,
  templates,
  today,
  canWrite,
  onClose,
  onSaved,
}: {
  contract: ContractView | null;
  customers: CustomerOption[];
  /** Writing one for this customer: the customer is set. */
  customerId?: string;
  templates: TemplateView[];
  today: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const first = customers.find((c) => c.id === customerId);
  const [v, setV] = React.useState<ContractInput>(
    contract ?? {
      customerId: customerId ?? "",
      pricing: "perKg",
      priceKobo: Number.NaN,
      minBirds: null,
      minPer: "week",
      deliveryEvery: "weekly",
      termsDays: first?.termsDays ?? 14,
      startDate: today,
      endDate: endAfter(today, 12),
      reviewOn: null,
      notes: "",
      document: null,
    },
  );
  const [files, setFiles] = React.useState<File[]>([]);
  const [template, setTemplate] = React.useState<{ on: boolean; name: string }>({ on: false, name: "" });
  const [submitted, setSubmitted] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"delete" | "end" | null>(null);
  const [endOn, setEndOn] = React.useState(today);
  const action = useAction();
  const errors = validateContract({ ...v, priceKobo: Number.isFinite(v.priceKobo) ? v.priceKobo : undefined });
  const show = (f: keyof ContractInput) => action.fieldError(f, submitted ? errors[f] : undefined);
  const set = <K extends keyof ContractInput>(k: K, value: ContractInput[K]) => setV((d) => ({ ...d, [k]: value }));

  const status = contract?.status ?? "draft";
  const ended = status === "expired" || status === "terminated";
  const editable = canWrite && !ended;
  const months = LENGTHS.find((m) => endAfter(v.startDate, m) === v.endDate);

  const save = (activate: boolean) => {
    setSubmitted(true);
    action.clear();
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      document.getElementById(firstError)?.focus();
      return;
    }
    const key = activate ? "activate" : "save";
    void action.run(
      async () => {
        const document = files[0] ? await uploadReceipt(files[0]) : v.document;
        const body = { ...v, document };
        if (!contract)
          return apiRequest<ContractView>("/api/contracts", "POST", {
            ...body,
            activate,
            ...(template.on && template.name.trim() && { saveAsTemplate: template.name }),
          });
        const saved = await apiRequest<ContractView>(`/api/contracts/${contract.id}`, "PATCH", {
          ...body,
          version: contract.version,
        });
        return activate ? apiRequest<ContractView>(`/api/contracts/${contract.id}/activate`, "POST") : saved;
      },
      {
        key,
        onSuccess: (saved) =>
          onSaved(
            activate
              ? `${saved.number} is active: ${saved.customerName}'s orders use its price.`
              : contract
                ? `${saved.number} saved.`
                : `${saved.number} saved as a draft.`,
          ),
      },
    );
  };

  const customerName = contract?.customerName ?? customers.find((c) => c.id === v.customerId)?.name;
  return (
    <>
      <Sheet
        open
        onClose={() => !action.busy && onClose()}
        title={contract ? `${contract.number} · ${contract.customerName}` : "Write a contract"}
        subtitle={
          contract ? (
            <span className="inline-flex items-center gap-2">
              <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>
              {day(contract.startDate)} to {day(contract.terminatedOn ?? contract.endDate)}
            </span>
          ) : (
            "What you agreed with a customer"
          )
        }
        footer={
          editable ? (
            <div className="space-y-2">
              <ActionFeedback action={action} />
              {status === "draft" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    size="lg"
                    loading={action.isPending("save")}
                    disabled={action.busy}
                    onClick={() => save(false)}
                  >
                    Save as draft
                  </Button>
                  <Button
                    size="lg"
                    loading={action.isPending("activate")}
                    disabled={action.busy}
                    onClick={() => save(true)}
                  >
                    <CircleCheck /> Make it active
                  </Button>
                </div>
              ) : (
                <Button
                  size="lg"
                  fullWidth
                  loading={action.isPending("save")}
                  disabled={action.busy}
                  onClick={() => save(false)}
                >
                  Save changes
                </Button>
              )}
              {contract && status === "draft" && (
                <Button
                  variant="ghost"
                  fullWidth
                  className="text-danger-fg"
                  disabled={action.busy}
                  onClick={() => setConfirm("delete")}
                >
                  <Trash2 /> Delete draft
                </Button>
              )}
              {contract && status === "active" && (
                <Button variant="ghost" fullWidth disabled={action.busy} onClick={() => setConfirm("end")}>
                  End it early
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        <div className="space-y-5">
          {ended && (
            <p className="rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-fg">
              This contract has ended, so it stays as it was agreed. Write a new one to keep selling on contract.
            </p>
          )}
          {status === "active" && contract && (
            <p className="rounded-xl border border-success-line bg-success-subtle px-3 py-2.5 text-sm text-fg">
              Running: {contract.customerName}&apos;s orders until {day(contract.endDate)} are priced at{" "}
              <strong>
                {formatNaira(contract.priceKobo)} {PER_UNIT[contract.pricing]}
              </strong>
              .
            </p>
          )}

          {!contract && !customerId && (
            <Field id="customerId" label="Customer" error={show("customerId")}>
              {(a11y) => (
                <Select
                  {...a11y}
                  value={v.customerId}
                  onChange={(e) => {
                    const c = customers.find((x) => x.id === e.target.value);
                    setV((d) => ({ ...d, customerId: e.target.value, termsDays: c?.termsDays ?? d.termsDays }));
                  }}
                >
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
          {!contract && customerId && customerName && (
            <p className="text-sm text-fg-muted">
              For <strong className="text-fg">{customerName}</strong>
            </p>
          )}

          {!contract && templates.length > 0 && (
            <div>
              <p id="template-label" className="mb-1.5 text-sm font-semibold text-fg">
                Start from a template
              </p>
              <div role="group" aria-labelledby="template-label" className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setV((d) => ({
                        ...d,
                        pricing: t.pricing,
                        priceKobo: t.priceKobo,
                        minBirds: t.minBirds,
                        minPer: t.minPer,
                        deliveryEvery: t.deliveryEvery,
                        termsDays: t.termsDays,
                        endDate: endAfter(d.startDate, t.months),
                      }))
                    }
                    className="focus-ring min-h-10 rounded-lg border border-line px-3 text-left text-sm hover:border-line-strong hover:bg-surface-subtle"
                  >
                    <span className="block font-semibold text-fg">{t.name}</span>
                    <span className="num block text-xs text-fg-muted">
                      {formatNaira(t.priceKobo)} {PER_UNIT[t.pricing]} · {t.months} months
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <fieldset disabled={!editable} className="min-w-0 space-y-5">
            <fieldset className="min-w-0 space-y-3 rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold text-fg">Price</legend>
              <Segmented
                label="Priced"
                className="w-full"
                value={v.pricing}
                onChange={(p: Pricing) => set("pricing", p)}
                options={[
                  { value: "perKg", label: PRICING_LABELS.perKg },
                  { value: "perBird", label: PRICING_LABELS.perBird },
                ]}
              />
              <Field id="priceKobo" label={`Price ${PER_UNIT[v.pricing]}`} error={show("priceKobo")}>
                {(a11y) => (
                  <MoneyInput
                    {...a11y}
                    value={Number.isFinite(v.priceKobo) ? v.priceKobo : null}
                    onChange={(k) => set("priceKobo", k ?? Number.NaN)}
                    placeholder={v.pricing === "perKg" ? "3,200.00" : "8,500.00"}
                  />
                )}
              </Field>
              <Field id="reviewOn" label="Prices can be reviewed on" error={show("reviewOn")} hint="Optional">
                {(a11y) => (
                  <Input
                    {...a11y}
                    type="date"
                    value={v.reviewOn ?? ""}
                    min={v.startDate}
                    onChange={(e) => set("reviewOn", e.target.value || null)}
                  />
                )}
              </Field>
            </fieldset>

            <fieldset className="min-w-0 space-y-3 rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold text-fg">How long</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="startDate" label="Starts" error={show("startDate")}>
                  {(a11y) => (
                    <Input
                      {...a11y}
                      type="date"
                      value={v.startDate}
                      onChange={(e) => {
                        const start = e.target.value;
                        // Keep the same length when the start moves.
                        setV((d) => ({
                          ...d,
                          startDate: start,
                          endDate: months && start ? endAfter(start, months) : d.endDate,
                        }));
                      }}
                    />
                  )}
                </Field>
                <Field id="endDate" label="Ends" error={show("endDate")}>
                  {(a11y) => (
                    <Input
                      {...a11y}
                      type="date"
                      value={v.endDate}
                      min={v.startDate}
                      onChange={(e) => set("endDate", e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <div role="group" aria-label="Length" className="flex flex-wrap gap-2">
                {LENGTHS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={months === m}
                    onClick={() => v.startDate && set("endDate", endAfter(v.startDate, m))}
                    className="focus-ring min-h-10 rounded-lg border border-line px-3 text-sm font-semibold text-fg aria-pressed:border-brand aria-pressed:bg-brand-subtle"
                  >
                    {m} months
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="min-w-0 space-y-3 rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold text-fg">Birds and deliveries</legend>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <Field id="minBirds" label="The fewest birds they take" error={show("minBirds")} hint="Optional">
                  {(a11y) => (
                    <Input
                      {...a11y}
                      inputMode="numeric"
                      className="num"
                      placeholder="200"
                      value={v.minBirds ?? ""}
                      onChange={(e) => {
                        const n = e.target.value.replace(/\D/g, "").slice(0, 7);
                        set("minBirds", n ? Number(n) : null);
                      }}
                    />
                  )}
                </Field>
                <Segmented
                  label="Each"
                  value={v.minPer}
                  onChange={(p: MinPer) => set("minPer", p)}
                  options={[
                    { value: "week", label: "a week" },
                    { value: "month", label: "a month" },
                  ]}
                />
              </div>
              <Field id="deliveryEvery" label="Deliveries" error={show("deliveryEvery")}>
                {(a11y) => (
                  <Select
                    {...a11y}
                    value={v.deliveryEvery}
                    onChange={(e) => set("deliveryEvery", e.target.value as DeliveryEvery)}
                  >
                    {DELIVERY_EVERY.map((d) => (
                      <option key={d} value={d}>
                        {DELIVERY_LABELS[d]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="termsDays" label="Days to pay each invoice" error={show("termsDays")}>
                {(a11y) => (
                  <Input
                    {...a11y}
                    inputMode="numeric"
                    className="num"
                    value={String(v.termsDays)}
                    onChange={(e) => set("termsDays", Number(e.target.value.replace(/\D/g, "").slice(0, 3) || 0))}
                  />
                )}
              </Field>
            </fieldset>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg">Signed contract</p>
              {v.document && !files.length ? (
                <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm">
                  <FileText className="size-4 text-fg-muted" aria-hidden />
                  <a
                    href={v.document.url}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring min-w-0 flex-1 truncate rounded font-semibold text-brand-fg"
                  >
                    {v.document.name || "The signed contract"}
                  </a>
                  {editable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remove the signed contract"
                      onClick={() => set("document", null)}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              ) : (
                editable && (
                  <FileDrop
                    files={files}
                    onChange={setFiles}
                    multiple={false}
                    label="Attach the signed copy"
                    hint="Optional. A PDF or photo, up to 5 MB."
                    maxSizeMB={5}
                  />
                )
              )}
              {!editable && !v.document && <p className="text-sm text-fg-subtle">None attached</p>}
            </div>

            <Field id="notes" label="Notes" error={show("notes")} hint="Optional: anything else agreed">
              {(a11y) => (
                <Textarea
                  {...a11y}
                  rows={2}
                  maxLength={1000}
                  value={v.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              )}
            </Field>

            {!contract && (
              <div className="space-y-2 rounded-xl border border-dashed border-line-strong p-4">
                <label className="flex items-center justify-between gap-3 text-sm font-semibold text-fg">
                  Keep these terms as a template
                  <ToggleSwitch
                    ariaLabel="Keep these terms as a template"
                    checked={template.on}
                    onChange={(on) => setTemplate((t) => ({ ...t, on }))}
                  />
                </label>
                {template.on && (
                  <Input
                    aria-label="Template name"
                    placeholder="Lounges, weekly, per kg"
                    maxLength={80}
                    value={template.name}
                    onChange={(e) => setTemplate((t) => ({ ...t, name: e.target.value }))}
                  />
                )}
              </div>
            )}
          </fieldset>
        </div>
      </Sheet>

      {contract && (
        <ConfirmDialog
          open={confirm === "delete"}
          onOpenChange={(open) => !open && setConfirm(null)}
          title={`Delete ${contract.number}?`}
          description="It's only a draft, so nothing used it. It stays in the audit log."
          confirmLabel="Delete draft"
          onConfirm={async () => {
            await apiRequest(`/api/contracts/${contract.id}`, "DELETE");
            onSaved(`${contract.number} deleted.`);
          }}
        />
      )}
      {contract && (
        <ConfirmDialog
          open={confirm === "end"}
          onOpenChange={(open) => !open && setConfirm(null)}
          title={`End ${contract.number} early?`}
          destructive={false}
          description={
            <span className="block space-y-3">
              <span className="block">
                {contract.customerName}&apos;s orders from then on are priced without it. It stays on record.
              </span>
              <label className="block text-left">
                <span className="text-xs font-semibold text-fg-muted">The last day it applied</span>
                <Input
                  type="date"
                  value={endOn}
                  min={contract.startDate}
                  max={today}
                  onChange={(e) => setEndOn(e.target.value)}
                />
              </label>
            </span>
          }
          confirmLabel="End contract"
          onConfirm={async () => {
            await apiRequest(`/api/contracts/${contract.id}/end`, "POST", { on: endOn });
            onSaved(`${contract.number} has ended.`);
          }}
        />
      )}
    </>
  );
}
