"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import { toast } from "sonner";

import { Field, useFocusFirstError } from "@/components/auth";
import { Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { formatInvoiceNumber, type SettingsInput, validateSettings } from "@/lib/settings/rules";
import { useToday } from "@/lib/use-today";

type Values = SettingsInput & { overheadMethod: string };

const ORDER = [
  "businessName",
  "address",
  "phone",
  "email",
  "invoicePrefix",
  "nextInvoiceNumber",
  "paymentTermsDays",
  "vatRateBps",
  "bankName",
  "accountNumber",
  "accountName",
  "expenseApprovalLimitKobo",
  "defaultPricePerKgKobo",
  "stockingDensity",
  "houseRestDays",
] as const;

/** The farm's settings, in the sections they matter in. One Save for all of them. */
export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const year = useToday()?.slice(0, 4);

  const form = useFormik<Values>({
    initialValues: initial,
    validate: (values) => validateSettings(values),
    onSubmit: async (values, helpers) => {
      try {
        const saved = await apiRequest<Values>("/api/settings", "PATCH", values);
        helpers.resetForm({ values: saved });
        toast.success("Settings saved.");
        router.refresh();
      } catch (e) {
        const error = e as AuthError;
        if (error.field) helpers.setFieldError(error.field, error.message);
        else toast.error(error.message);
      }
    },
  });
  useFocusFirstError(form, ORDER);

  // Errors show once someone has touched the field or tried to save.
  const error = (name: keyof Values) =>
    (form.submitCount > 0 || form.touched[name]) && typeof form.errors[name] === "string"
      ? form.errors[name]
      : undefined;
  const text = (name: keyof SettingsInput) => form.getFieldProps(name);
  const number = (name: "nextInvoiceNumber" | "paymentTermsDays" | "houseRestDays") => ({
    name,
    value: Number.isFinite(form.values[name]) ? String(form.values[name]) : "",
    onBlur: form.handleBlur,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      void form.setFieldValue(name, e.target.value === "" ? Number.NaN : Number(e.target.value)),
  });

  const prefix = form.values.invoicePrefix || "INV";
  const next = Number.isSafeInteger(form.values.nextInvoiceNumber) ? form.values.nextInvoiceNumber : 1;

  return (
    <form noValidate onSubmit={form.handleSubmit} className="space-y-6">
      <Panel title="Business" description="How the farm appears on invoices, statements and payslips.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="businessName" label="Business name" error={error("businessName")} className="sm:col-span-2">
            {(a11y) => <Input {...a11y} {...text("businessName")} autoComplete="organization" />}
          </Field>
          <Field id="address" label="Address" error={error("address")} className="sm:col-span-2">
            {(a11y) => <Textarea {...a11y} {...text("address")} rows={2} autoComplete="street-address" />}
          </Field>
          <Field id="phone" label="Phone" error={error("phone")}>
            {(a11y) => <Input {...a11y} {...text("phone")} type="tel" autoComplete="tel" placeholder="0803 000 0000" />}
          </Field>
          <Field id="email" label="Email" error={error("email")}>
            {(a11y) => <Input {...a11y} {...text("email")} type="email" placeholder="hello@fowlex.com" />}
          </Field>
        </div>
      </Panel>

      <Panel title="Invoices" description="Numbering, payment terms, VAT and where customers pay.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="invoicePrefix" label="Number prefix" error={error("invoicePrefix")}>
            {(a11y) => (
              <Input
                {...a11y}
                {...text("invoicePrefix")}
                onChange={(e) => void form.setFieldValue("invoicePrefix", e.target.value.toUpperCase())}
                className="font-mono uppercase"
                maxLength={6}
              />
            )}
          </Field>
          <Field
            id="nextInvoiceNumber"
            label="Next number"
            error={error("nextInvoiceNumber")}
            hint={
              <span aria-live="polite">
                Next invoice: <code className="text-fg">{year ? formatInvoiceNumber(prefix, year, next) : "…"}</code>
              </span>
            }
          >
            {(a11y) => <Input {...a11y} {...number("nextInvoiceNumber")} inputMode="numeric" className="num" />}
          </Field>
          <Field
            id="paymentTermsDays"
            label="Payment terms (days)"
            error={error("paymentTermsDays")}
            hint="How long customers have to pay, unless their contract says otherwise."
          >
            {(a11y) => <Input {...a11y} {...number("paymentTermsDays")} inputMode="numeric" className="num" />}
          </Field>
          <div className="space-y-1.5">
            <span className="text-sm font-semibold text-fg">VAT</span>
            <div className="flex min-h-11 items-center gap-3">
              <ToggleSwitch
                checked={form.values.vatEnabled}
                onChange={(on) => void form.setFieldValue("vatEnabled", on)}
                ariaLabel="Charge VAT on invoices"
              />
              <span className="text-sm text-fg-muted">
                {form.values.vatEnabled ? "Charged on invoices at" : "Not charged"}
              </span>
              {form.values.vatEnabled && (
                <span className="flex items-center gap-1.5">
                  <Input
                    aria-label="VAT rate (%)"
                    aria-invalid={error("vatRateBps") ? true : undefined}
                    inputMode="decimal"
                    className="num w-20"
                    value={Number.isFinite(form.values.vatRateBps) ? String(form.values.vatRateBps / 100) : ""}
                    onChange={(e) =>
                      void form.setFieldValue(
                        "vatRateBps",
                        e.target.value === "" ? Number.NaN : Math.round(Number(e.target.value) * 100),
                      )
                    }
                  />
                  <span className="text-sm text-fg-muted">%</span>
                </span>
              )}
            </div>
            {error("vatRateBps") && <p className="text-[13px] font-medium text-danger-fg">{error("vatRateBps")}</p>}
          </div>
          <Field id="bankName" label="Bank" error={error("bankName")}>
            {(a11y) => <Input {...a11y} {...text("bankName")} placeholder="GTBank" />}
          </Field>
          <Field id="accountNumber" label="Account number" error={error("accountNumber")}>
            {(a11y) => (
              <Input
                {...a11y}
                {...text("accountNumber")}
                inputMode="numeric"
                maxLength={10}
                className="num font-mono"
              />
            )}
          </Field>
          <Field id="accountName" label="Account name" error={error("accountName")} className="sm:col-span-2">
            {(a11y) => <Input {...a11y} {...text("accountName")} placeholder="Fowlex Farms Ltd" />}
          </Field>
        </div>
      </Panel>

      <Panel title="Approvals and pricing">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="expenseApprovalLimitKobo"
            label="Expense approval limit"
            error={error("expenseApprovalLimitKobo")}
            hint="Expenses above this wait for an owner's approval before they count."
          >
            {(a11y) => (
              <MoneyInput
                {...a11y}
                value={form.values.expenseApprovalLimitKobo}
                onChange={(kobo) => void form.setFieldValue("expenseApprovalLimitKobo", kobo ?? Number.NaN)}
              />
            )}
          </Field>
          <Field
            id="defaultPricePerKgKobo"
            label="Default price per kg"
            error={error("defaultPricePerKgKobo")}
            hint="Where a sale starts when the customer has no contract. Leave empty to set it each time."
          >
            {(a11y) => (
              <MoneyInput
                {...a11y}
                value={form.values.defaultPricePerKgKobo}
                onChange={(kobo) => void form.setFieldValue("defaultPricePerKgKobo", kobo)}
                placeholder="0.00"
              />
            )}
          </Field>
        </div>
      </Panel>

      <Panel title="Houses and biosecurity" description="Used when adding houses and placing batches.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="stockingDensity"
            label="Stocking density (birds per m²)"
            error={error("stockingDensity")}
            hint="House capacity is suggested from floor area at this density. 10–12 suits open-sided houses; less in the hot season."
          >
            {(a11y) => (
              <Input
                {...a11y}
                name="stockingDensity"
                inputMode="decimal"
                className="num"
                value={Number.isFinite(form.values.stockingDensity) ? String(form.values.stockingDensity) : ""}
                onBlur={form.handleBlur}
                onChange={(e) =>
                  void form.setFieldValue(
                    "stockingDensity",
                    e.target.value === "" ? Number.NaN : Number(e.target.value),
                  )
                }
              />
            )}
          </Field>
          <Field
            id="houseRestDays"
            label="Rest between batches (days)"
            error={error("houseRestDays")}
            hint="Cleaning, disinfection and downtime after a batch leaves. Placing sooner asks you to confirm. At least 7 is advised."
          >
            {(a11y) => <Input {...a11y} {...number("houseRestDays")} inputMode="numeric" className="num" />}
          </Field>
        </div>
      </Panel>

      <Panel title="Costing">
        <p className="text-sm font-semibold text-fg">Shared costs are split by bird-days</p>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Rent, power, salaried staff and depreciation for a month are shared across the batches on the farm that month,
          in proportion to how many birds each had and for how many days. A batch of 1,000 birds for 30 days carries
          three times the share of 1,000 birds for 10 days.
        </p>
      </Panel>

      {/* Sticks to the bottom of the screen while the form scrolls; above the tab bar on phones. */}
      <div className="sticky bottom-16 z-20 -mx-4 border-t border-line bg-canvas/90 backdrop-blur-md md:-mx-8 lg:bottom-0">
        <div className="flex items-center justify-end gap-2 px-4 py-3 md:px-8">
          {form.dirty && <span className="mr-auto text-sm text-fg-muted">You have unsaved changes.</span>}
          <Button variant="ghost" disabled={!form.dirty || form.isSubmitting} onClick={() => form.resetForm()}>
            Discard
          </Button>
          <Button type="submit" loading={form.isSubmitting} disabled={!form.dirty}>
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}
