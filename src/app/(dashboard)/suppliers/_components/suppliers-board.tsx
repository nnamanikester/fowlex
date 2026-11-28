"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Landmark, Phone, Plus, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

import { BankAccountField, type BankState } from "@/components/bank-account-field";
import { Field } from "@/components/auth";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { ConfirmDialog, EmptyState, Fab, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/auth/client";
import { useAction } from "@/lib/use-action";
import {
  formatPhone,
  maskAccount,
  nameKey,
  SUPPLIES,
  SUPPLY_LABELS,
  type SupplierInput,
  validateSupplier,
} from "@/lib/suppliers/rules";
import type { SupplierView } from "@/lib/suppliers/service";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

/** The farm's suppliers as cards: what they supply, how to reach them, and whether they can be paid. */
export function SuppliersBoard({
  suppliers,
  owed = {},
  canWrite,
}: {
  suppliers: SupplierView[];
  /** What each supplier is owed, in kobo, by id. */
  owed?: Record<string, number>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<SupplierView | "new" | null>(null);
  const [query, setQuery] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  const shown = suppliers.filter(
    (s) =>
      (showArchived || !s.archived) &&
      (!query.trim() ||
        nameKey(s.name).includes(nameKey(query)) ||
        s.supplies.some((x) => SUPPLY_LABELS[x].toLowerCase().includes(query.trim().toLowerCase()))),
  );

  return (
    <div className="space-y-4">
      {suppliers.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Truck />}
            title="No suppliers yet"
            description="Add the hatchery, feed mill, drug store and transporters you use. With their bank account you can pay them from here."
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setEditing("new")}>
                  <Plus /> Add a supplier
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 basis-56">
              <span className="sr-only">Search suppliers</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Search by name or what they supply"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </label>
            {canWrite && (
              <Button size="sm" className="hidden lg:inline-flex" onClick={() => setEditing("new")}>
                <Plus /> Add supplier
              </Button>
            )}
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((s) => (
              <li key={s.id} className="relative">
                <Link
                  href={`/suppliers/${s.id}`}
                  className="focus-ring flex h-full w-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 pb-14 text-left shadow-card hover:border-line-strong"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-lg font-bold text-fg-heading">{s.name}</span>
                    {s.archived && <Badge>Archived</Badge>}
                  </span>
                  <span className="text-sm text-fg-muted">
                    {s.supplies.map((x) => SUPPLY_LABELS[x]).join(" · ") || "Supplier"}
                  </span>
                  {s.bank ? (
                    <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                      <Landmark className="size-3.5" aria-hidden />
                      {s.bank.bankName} {maskAccount(s.bank.accountNumber)}
                      <Badge tone={s.bank.payable ? "success" : "warning"}>
                        {s.bank.payable ? "Can pay" : "Checking"}
                      </Badge>
                    </span>
                  ) : (
                    <span className="text-xs text-fg-subtle">No bank account</span>
                  )}
                  {(owed[s.id] ?? 0) > 0 && (
                    <span className="num text-sm font-semibold text-warning-fg">You owe {formatNaira(owed[s.id])}</span>
                  )}
                </Link>
                {s.phone && (
                  <a
                    href={`tel:${s.phone}`}
                    className="focus-ring absolute bottom-3 left-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-fg hover:bg-brand-subtle"
                  >
                    <Phone className="size-4" aria-hidden /> {formatPhone(s.phone)}
                  </a>
                )}
              </li>
            ))}
          </ul>
          {shown.length === 0 && (
            <Panel>
              <EmptyState icon={<Search />} title="No matching suppliers" description="Try another name." />
            </Panel>
          )}
          {suppliers.some((s) => s.archived) && (
            <button
              type="button"
              className="focus-ring rounded-md text-sm font-medium text-brand-fg"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide archived suppliers" : "Show archived suppliers"}
            </button>
          )}
        </>
      )}

      {canWrite && <Fab label="Add supplier" icon={<Plus />} onClick={() => setEditing("new")} />}
      {editing && (
        <SupplierSheet
          key={editing === "new" ? "new" : editing.id}
          supplier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            toast.success(message);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const EMPTY: SupplierInput = {
  name: "",
  supplies: [],
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  bank: null,
};

/** Add or edit a supplier. Exported for adding one in the middle of a purchase. */
export function SupplierSheet({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: SupplierView | null;
  onClose: () => void;
  onSaved: (message: string, saved: SupplierView) => void;
}) {
  const [v, setV] = React.useState<SupplierInput>(() =>
    supplier
      ? {
          name: supplier.name,
          supplies: supplier.supplies,
          contactName: supplier.contactName,
          phone: supplier.phone ? formatPhone(supplier.phone) : "",
          email: supplier.email,
          address: supplier.address,
          notes: supplier.notes,
          bank: supplier.bank,
        }
      : EMPTY,
  );
  const [bankState, setBankState] = React.useState<BankState>(supplier?.bank ? "found" : "empty");
  const [submitted, setSubmitted] = React.useState(false);
  const action = useAction();
  const [deleting, setDeleting] = React.useState(false);

  const errors = validateSupplier(v);
  const bankError =
    bankState === "unavailable"
      ? "The bank couldn't be reached to check this account. Tap Retry, or clear both fields to add it later."
      : bankState === "partial" || bankState === "not-found"
        ? "Finish the bank account so the bank can name it, or clear both fields."
        : bankState === "checking"
          ? "Wait for the bank to name the account."
          : undefined;
  const show = (name: keyof SupplierInput) => action.fieldError(name, submitted ? errors[name] : undefined);
  const set = <K extends keyof SupplierInput>(name: K, value: SupplierInput[K]) =>
    setV((d) => ({ ...d, [name]: value }));

  const save = async (extra: { archived?: boolean } = {}) => {
    setSubmitted(true);
    action.clear();
    if (Object.keys(errors).length || (bankError && extra.archived === undefined)) {
      document.getElementById(Object.keys(errors)[0] ?? "accountNumber")?.focus();
      return;
    }
    await action.run(
      () =>
        supplier
          ? apiRequest<SupplierView>(`/api/suppliers/${supplier.id}`, "PATCH", {
              ...v,
              ...extra,
              version: supplier.version,
            })
          : apiRequest<SupplierView>("/api/suppliers", "POST", v),
      {
        key: extra.archived !== undefined ? "archive" : "save",
        onSuccess: (saved) =>
          onSaved(
            extra.archived !== undefined
              ? extra.archived
                ? `${saved.name} archived.`
                : `${saved.name} is back.`
              : supplier
                ? `${saved.name} saved.`
                : `${saved.name} added.`,
            saved,
          ),
      },
    );
  };

  return (
    <>
      <Sheet
        open
        onClose={() => !action.busy && onClose()}
        title={supplier ? supplier.name : "Add a supplier"}
        subtitle={supplier ? "Edit supplier" : "Someone you buy from or pay"}
        footer={
          <div className="space-y-2">
            <ActionFeedback action={action} />
            <Button
              type="submit"
              form="supplier-form"
              size="lg"
              fullWidth
              loading={action.isPending("save")}
              disabled={action.busy}
            >
              {supplier ? "Save changes" : "Add supplier"}
            </Button>
            {supplier && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  loading={action.isPending("archive")}
                  disabled={action.busy}
                  onClick={() => void save({ archived: !supplier.archived })}
                >
                  <Archive /> {supplier.archived ? "Unarchive" : "Archive"}
                </Button>
                <Button
                  variant="ghost"
                  className="text-danger-fg"
                  disabled={action.busy}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 /> Delete
                </Button>
              </div>
            )}
          </div>
        }
      >
        <form
          id="supplier-form"
          noValidate
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field id="name" label="Name" error={show("name")}>
            {(a11y) => (
              <Input
                {...a11y}
                value={v.name}
                maxLength={80}
                autoComplete="organization"
                placeholder="Amo Byng hatchery"
                onChange={(e) => set("name", e.target.value)}
              />
            )}
          </Field>
          <fieldset className="min-w-0">
            <legend className="mb-2 text-sm font-semibold text-fg">Supplies</legend>
            <div className="flex flex-wrap gap-2">
              {SUPPLIES.map((x) => {
                const on = v.supplies.includes(x);
                return (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("supplies", on ? v.supplies.filter((y) => y !== x) : [...v.supplies, x])}
                    className={cn(
                      "focus-ring rounded-full border px-3 py-1.5 text-sm font-medium",
                      on ? "border-brand bg-brand-subtle text-brand-fg" : "border-line bg-surface text-fg-muted",
                    )}
                  >
                    {SUPPLY_LABELS[x]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="contactName" label="Contact person" error={show("contactName")} hint="Optional">
              {(a11y) => (
                <Input
                  {...a11y}
                  value={v.contactName}
                  maxLength={120}
                  onChange={(e) => set("contactName", e.target.value)}
                />
              )}
            </Field>
            <Field id="phone" label="Phone" error={show("phone")} hint="Optional">
              {(a11y) => (
                <Input
                  {...a11y}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0803 123 4567"
                  value={v.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              )}
            </Field>
          </div>

          <fieldset className="min-w-0 space-y-2 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-fg">Bank account for payments</legend>
            <p className="text-sm text-fg-muted">Optional. Add it to pay them from Fowlex through Paystack.</p>
            <BankAccountField
              value={supplier?.bank ?? null}
              onChange={(bank) => set("bank", bank)}
              onState={setBankState}
              error={action.fieldError("bank", submitted ? bankError : undefined)}
            />
          </fieldset>

          <Field id="email" label="Email" error={show("email")} hint="Optional">
            {(a11y) => (
              <Input
                {...a11y}
                type="email"
                autoComplete="email"
                value={v.email}
                onChange={(e) => set("email", e.target.value)}
              />
            )}
          </Field>
          <Field id="address" label="Address" error={show("address")} hint="Optional">
            {(a11y) => (
              <Input {...a11y} value={v.address} maxLength={300} onChange={(e) => set("address", e.target.value)} />
            )}
          </Field>
          <Field id="notes" label="Notes" error={show("notes")} hint="Optional: prices, delivery days">
            {(a11y) => (
              <Textarea
                {...a11y}
                rows={2}
                maxLength={500}
                value={v.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            )}
          </Field>
        </form>
      </Sheet>
      {supplier && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${supplier.name}?`}
          description="They leave your suppliers. Their history stays in the audit log."
          confirmLabel="Delete supplier"
          onConfirm={async () => {
            await apiRequest(`/api/suppliers/${supplier.id}`, "DELETE");
            onSaved(`${supplier.name} deleted.`, supplier);
          }}
        />
      )}
    </>
  );
}
