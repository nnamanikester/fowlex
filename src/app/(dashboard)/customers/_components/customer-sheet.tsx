"use client";

import * as React from "react";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";

import { Field } from "@/components/auth";
import { ConfirmDialog } from "@/components/kit";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/auth/client";
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  type CustomerInput,
  type CustomerType,
  validateCustomer,
} from "@/lib/customers/rules";
import type { CustomerView } from "@/lib/customers/service";
import { formatPhone } from "@/lib/suppliers/rules";
import { useAction } from "@/lib/use-action";

/** Common payment terms, one tap each; any other number can be typed. */
const TERMS = [0, 7, 14, 30];

/** Adds a customer, or edits one: who they are, how to reach them, how long they have to pay. */
export function CustomerSheet({
  customer,
  defaultTermsDays,
  onClose,
  onSaved,
}: {
  customer: CustomerView | null;
  defaultTermsDays: number;
  onClose: () => void;
  /** After a save, with the customer saved (none after a delete). */
  onSaved: (message: string, customer?: CustomerView) => void;
}) {
  const [v, setV] = React.useState<CustomerInput>(
    customer
      ? { ...customer, phone: customer.phone ? formatPhone(customer.phone) : "" }
      : {
          name: "",
          type: "restaurant",
          contactName: "",
          phone: "",
          email: "",
          address: "",
          creditLimitKobo: null,
          termsDays: defaultTermsDays,
          notes: "",
        },
  );
  const [submitted, setSubmitted] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const action = useAction();
  const errors = validateCustomer(v);
  const show = (f: keyof CustomerInput) => action.fieldError(f, submitted ? errors[f] : undefined);
  const set = <K extends keyof CustomerInput>(k: K, value: CustomerInput[K]) => setV((d) => ({ ...d, [k]: value }));

  const save = () => {
    setSubmitted(true);
    action.clear();
    const first = Object.keys(errors)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    void action.run(
      () =>
        customer
          ? apiRequest<CustomerView>(`/api/customers/${customer.id}`, "PATCH", { ...v, version: customer.version })
          : apiRequest<CustomerView>("/api/customers", "POST", v),
      {
        key: "save",
        onSuccess: (saved) => onSaved(customer ? `${saved.name} saved.` : `${saved.name} added.`, saved),
      },
    );
  };

  return (
    <>
      <Sheet
        open
        onClose={() => !action.busy && onClose()}
        title={customer ? customer.name : "Add a customer"}
        subtitle={customer ? "Edit customer" : "Someone you sell birds to"}
        footer={
          <div className="space-y-2">
            <ActionFeedback action={action} />
            <Button size="lg" fullWidth loading={action.isPending("save")} disabled={action.busy} onClick={save}>
              {customer ? "Save changes" : "Add customer"}
            </Button>
            {customer && !customer.walkIn && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  loading={action.isPending("status")}
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(
                      () =>
                        apiRequest<CustomerView>(`/api/customers/${customer.id}/status`, "POST", {
                          status: customer.status === "active" ? "archived" : "active",
                        }),
                      {
                        key: "status",
                        onSuccess: (saved) =>
                          onSaved(
                            saved.status === "archived" ? `${saved.name} archived.` : `${saved.name} is back.`,
                            saved,
                          ),
                      },
                    )
                  }
                >
                  {customer.status === "active" ? (
                    <>
                      <Archive /> Archive
                    </>
                  ) : (
                    <>
                      <ArchiveRestore /> Bring back
                    </>
                  )}
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
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="name" label="Name" error={show("name")}>
              {(a11y) => (
                <Input
                  {...a11y}
                  value={v.name}
                  placeholder="The Grill Lounge"
                  maxLength={120}
                  onChange={(e) => set("name", e.target.value)}
                />
              )}
            </Field>
            <Field id="type" label="Kind of customer" error={show("type")}>
              {(a11y) => (
                <Select {...a11y} value={v.type} onChange={(e) => set("type", e.target.value as CustomerType)}>
                  {CUSTOMER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CUSTOMER_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <fieldset className="min-w-0 space-y-3 rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-fg">Paying</legend>
            <div>
              <p id="terms-label" className="mb-1.5 text-sm font-semibold text-fg">
                Days they have to pay
              </p>
              <div role="group" aria-labelledby="terms-label" className="flex flex-wrap items-center gap-2">
                {TERMS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={v.termsDays === d}
                    onClick={() => set("termsDays", d)}
                    className="focus-ring min-h-10 rounded-lg border border-line px-3 text-sm font-semibold text-fg aria-pressed:border-brand aria-pressed:bg-brand-subtle"
                  >
                    {d === 0 ? "On delivery" : `${d} days`}
                  </button>
                ))}
                <Input
                  id="termsDays"
                  aria-label="Days to pay"
                  aria-invalid={show("termsDays") ? true : undefined}
                  inputMode="numeric"
                  className="num w-24"
                  value={String(v.termsDays)}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, "").slice(0, 3));
                    set("termsDays", Number.isFinite(n) ? n : 0);
                  }}
                />
              </div>
              {show("termsDays") && <p className="mt-1 text-[13px] font-medium text-danger-fg">{show("termsDays")}</p>}
            </div>
            <Field
              id="creditLimitKobo"
              label="Most they may owe"
              error={show("creditLimitKobo")}
              hint="Optional. Fowlex warns before an order takes them over it."
            >
              {(a11y) => (
                <MoneyInput
                  {...a11y}
                  value={v.creditLimitKobo}
                  onChange={(k) => set("creditLimitKobo", k)}
                  placeholder="No limit"
                />
              )}
            </Field>
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
            <Field id="email" label="Email" error={show("email")} hint="For invoices and statements">
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
            <Field id="address" label="Delivery address" error={show("address")} hint="Optional">
              {(a11y) => (
                <Input {...a11y} value={v.address} maxLength={300} onChange={(e) => set("address", e.target.value)} />
              )}
            </Field>
          </div>
          <Field id="notes" label="Notes" error={show("notes")} hint="Optional: delivery days, who to call">
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
        </div>
      </Sheet>
      {customer && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${customer.name}?`}
          description="Only for a customer added by mistake. It stays in the audit log. To stop selling to them, archive them instead."
          confirmLabel="Delete customer"
          onConfirm={async () => {
            await apiRequest(`/api/customers/${customer.id}`, "DELETE");
            onSaved(`${customer.name} deleted.`);
          }}
        />
      )}
    </>
  );
}
