"use client";

import * as React from "react";
import { UserCheck, UserPlus } from "lucide-react";

import { BankAccountField, type BankState } from "@/components/bank-account-field";
import { Field } from "@/components/auth";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/auth/client";
import { formatNaira } from "@/lib/money";
import { type EmployeeInput, PAY_TYPES, type PayType, PER, validateEmployee } from "@/lib/people/rules";
import type { EmployeeView } from "@/lib/people/service";
import { formatPhone } from "@/lib/suppliers/rules";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

export const payLine = (e: Pick<EmployeeView, "rateKobo" | "payType">) =>
  `${formatNaira(e.rateKobo)} ${PER[e.payType]}`;

/** Adds someone, or edits them: pay, bank account, contact; marks them as left; gives them a login. */
export function EmployeeSheet({
  employee,
  batches,
  today,
  canInvite,
  onClose,
  onSaved,
}: {
  employee: EmployeeView | null;
  batches: { id: string; code: string }[];
  today: string;
  canInvite: boolean;
  onClose: () => void;
  /** After a save, with the person saved (when there is one). */
  onSaved: (message: string, id?: string) => void;
}) {
  const [v, setV] = React.useState<EmployeeInput>(
    employee
      ? {
          ...employee,
          phone: employee.phone ? formatPhone(employee.phone) : "",
          nextOfKinPhone: employee.nextOfKinPhone ? formatPhone(employee.nextOfKinPhone) : "",
        }
      : {
          name: "",
          job: "",
          phone: "",
          email: "",
          address: "",
          nextOfKinName: "",
          nextOfKinPhone: "",
          startDate: today,
          payType: "monthly",
          rateKobo: Number.NaN,
          batchIds: [],
          notes: "",
          bank: null,
        },
  );
  const [bankState, setBankState] = React.useState<BankState>(employee?.bank ? "found" : "empty");
  const [submitted, setSubmitted] = React.useState(false);
  const action = useAction();
  const errors = validateEmployee(v, { today });
  const show = (f: keyof EmployeeInput) => action.fieldError(f, submitted ? errors[f] : undefined);
  const set = <K extends keyof EmployeeInput>(k: K, value: EmployeeInput[K]) => setV((d) => ({ ...d, [k]: value }));
  const bankUnfinished = ["partial", "checking", "not-found", "unavailable"].includes(bankState);
  const bankProblem =
    bankState === "checking"
      ? "Wait a moment: the bank is still naming this account."
      : bankState === "unavailable"
        ? "The bank couldn't be reached to check this account. Tap Retry, or clear both fields to add the bank account later."
        : "Finish the bank account so the bank can name it, or clear both fields.";

  const call = (key: string, fn: () => Promise<unknown>, message: string) =>
    action.run(fn as () => Promise<{ id?: string } | undefined>, {
      key,
      onSuccess: (saved) => onSaved(message, saved?.id),
    });
  const save = () => {
    setSubmitted(true);
    action.clear();
    if (Object.keys(errors).length || bankUnfinished) {
      document.getElementById(Object.keys(errors)[0] ?? "accountNumber")?.focus();
      return;
    }
    void call(
      "save",
      () =>
        employee
          ? apiRequest(`/api/employees/${employee.id}`, "PATCH", { ...v, version: employee.version })
          : apiRequest("/api/employees", "POST", v),
      employee ? `${v.name.trim()} saved.` : `${v.name.trim()} added.`,
    );
  };

  return (
    <Sheet
      open
      onClose={() => !action.busy && onClose()}
      title={employee ? employee.name : "Add someone"}
      subtitle={employee ? payLine(employee) : "Someone who works on the farm"}
      footer={
        <div className="space-y-2">
          <ActionFeedback action={action} />
          <Button size="lg" fullWidth loading={action.isPending("save")} disabled={action.busy} onClick={save}>
            {employee ? "Save changes" : "Add"}
          </Button>
          {employee && (
            <div className="grid grid-cols-2 gap-2">
              {canInvite && employee.status === "active" && employee.email && !employee.hasLogin && (
                <Button
                  variant="ghost"
                  loading={action.isPending("invite")}
                  disabled={action.busy}
                  onClick={() =>
                    void call(
                      "invite",
                      () => apiRequest("/api/users/invites", "POST", { email: employee.email, role: "staff" }),
                      `Invite sent to ${employee.email}: they can log the farm's days.`,
                    )
                  }
                >
                  <UserPlus /> Give a Fowlex login
                </Button>
              )}
              <Button
                variant="ghost"
                loading={action.isPending("status")}
                disabled={action.busy}
                onClick={() =>
                  void call(
                    "status",
                    () =>
                      apiRequest(`/api/employees/${employee.id}/status`, "POST", {
                        status: employee.status === "active" ? "left" : "active",
                      }),
                    employee.status === "active" ? `${employee.name} marked as left.` : `${employee.name} is back.`,
                  )
                }
              >
                <UserCheck /> {employee.status === "active" ? "Left the farm" : "Back at work"}
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
                maxLength={120}
                autoComplete="off"
                onChange={(e) => set("name", e.target.value)}
              />
            )}
          </Field>
          <Field id="job" label="Job" error={show("job")} hint="Optional">
            {(a11y) => (
              <Input
                {...a11y}
                value={v.job}
                maxLength={120}
                placeholder="Farm hand"
                onChange={(e) => set("job", e.target.value)}
              />
            )}
          </Field>
        </div>

        <fieldset className="min-w-0 space-y-3">
          <legend className="mb-1 text-sm font-semibold text-fg">Pay</legend>
          <Segmented
            label="Paid"
            className="w-full"
            value={v.payType}
            onChange={(p: PayType) => set("payType", p)}
            options={PAY_TYPES.map((p) => ({
              value: p,
              label: p === "monthly" ? "Monthly" : p === "daily" ? "By the day" : "Per batch",
            }))}
          />
          <Field id="rateKobo" label={`Pay ${PER[v.payType]}`} error={show("rateKobo")}>
            {(a11y) => (
              <MoneyInput
                {...a11y}
                value={Number.isFinite(v.rateKobo) ? v.rateKobo : null}
                onChange={(k) => set("rateKobo", k ?? Number.NaN)}
                placeholder={v.payType === "daily" ? "4,000.00" : "60,000.00"}
              />
            )}
          </Field>
          {v.payType === "daily" && (
            <p className="text-xs text-fg-muted">Payroll counts the days ticked on the attendance sheet.</p>
          )}
          {v.payType === "per-batch" && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg">Looks after</p>
              {batches.length ? (
                <div className="flex flex-wrap gap-2">
                  {batches.map((b) => {
                    const on = v.batchIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          set("batchIds", on ? v.batchIds.filter((x) => x !== b.id) : [...v.batchIds, b.id])
                        }
                        className={cn(
                          "focus-ring rounded-full border px-3 py-1.5 font-mono text-sm",
                          on ? "border-brand bg-brand-subtle text-brand-fg" : "border-line bg-surface text-fg-muted",
                        )}
                      >
                        {b.code}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-fg-muted">No batches on the farm yet.</p>
              )}
              <p className="text-xs text-fg-muted">Paid for each of these batches in the month it&apos;s closed.</p>
            </div>
          )}
        </fieldset>

        <fieldset className="min-w-0 space-y-2 rounded-xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-fg">Bank account for their pay</legend>
          <BankAccountField
            value={employee?.bank ?? null}
            onChange={(bank) => set("bank", bank)}
            onState={setBankState}
            error={submitted && bankUnfinished ? bankProblem : show("bank")}
          />
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="phone" label="Phone" error={show("phone")} hint="Optional">
            {(a11y) => (
              <Input
                {...a11y}
                type="tel"
                inputMode="tel"
                value={v.phone}
                placeholder="0803 123 4567"
                onChange={(e) => set("phone", e.target.value)}
              />
            )}
          </Field>
          <Field id="email" label="Email" error={show("email")} hint="For payslips, and a Fowlex login">
            {(a11y) => <Input {...a11y} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />}
          </Field>
          <Field id="startDate" label="Started on" error={show("startDate")}>
            {(a11y) => (
              <Input
                {...a11y}
                type="date"
                value={v.startDate}
                max={today}
                onChange={(e) => set("startDate", e.target.value)}
              />
            )}
          </Field>
          <Field id="address" label="Address" error={show("address")} hint="Optional">
            {(a11y) => (
              <Input {...a11y} value={v.address} maxLength={300} onChange={(e) => set("address", e.target.value)} />
            )}
          </Field>
          <Field id="nextOfKinName" label="Next of kin" error={show("nextOfKinName")} hint="Optional">
            {(a11y) => (
              <Input
                {...a11y}
                value={v.nextOfKinName}
                maxLength={120}
                onChange={(e) => set("nextOfKinName", e.target.value)}
              />
            )}
          </Field>
          <Field id="nextOfKinPhone" label="Next of kin's phone" error={show("nextOfKinPhone")} hint="Optional">
            {(a11y) => (
              <Input
                {...a11y}
                type="tel"
                inputMode="tel"
                value={v.nextOfKinPhone}
                onChange={(e) => set("nextOfKinPhone", e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field id="notes" label="Notes" error={show("notes")} hint="Optional">
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
  );
}
