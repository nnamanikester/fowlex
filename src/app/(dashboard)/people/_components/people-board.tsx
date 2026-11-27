"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Landmark, Phone, Plus, UserCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { BankAccountField, type BankState } from "@/components/bank-account-field";
import { Field, FormAlert } from "@/components/auth";
import { EmptyState, Fab, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { formatNaira } from "@/lib/money";
import {
  type EmployeeInput,
  PAY_TYPE_LABELS,
  PAY_TYPES,
  type PayType,
  PER,
  validateEmployee,
} from "@/lib/people/rules";
import type { EmployeeView } from "@/lib/people/service";
import { formatPhone, maskAccount } from "@/lib/suppliers/rules";
import { cn } from "@/lib/utils";

export const payLine = (e: Pick<EmployeeView, "rateKobo" | "payType">) =>
  `${formatNaira(e.rateKobo)} ${PER[e.payType]}`;

/** Everyone who works on the farm, as cards; each opens a sheet to edit them. */
export function PeopleBoard({
  employees,
  batches,
  today,
  canWrite,
  canInvite,
}: {
  employees: EmployeeView[];
  batches: { id: string; code: string }[];
  today: string;
  canWrite: boolean;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<EmployeeView | "new" | null>(null);
  const [showLeft, setShowLeft] = React.useState(false);
  const working = employees.filter((e) => e.status === "active");
  const shown = showLeft ? employees : working;
  const monthly = working.filter((e) => e.payType === "monthly").reduce((n, e) => n + e.rateKobo, 0);

  return (
    <div className="space-y-4">
      {employees.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-fg-muted">
            <span className="num font-semibold text-fg">{working.length}</span> working here
            {monthly > 0 && (
              <>
                {" · "}
                <span className="num font-semibold text-fg">{formatNaira(monthly)}</span> in monthly salaries
              </>
            )}
          </p>
          {canWrite && (
            <Button size="sm" className="hidden lg:inline-flex" onClick={() => setEditing("new")}>
              <Plus /> Add someone
            </Button>
          )}
        </div>
      )}
      {employees.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Users />}
            title="No one added yet"
            description="Add the people who work on the farm, how they're paid and their bank account, so payroll can pay them from here."
            action={
              canWrite ? (
                <Button size="sm" onClick={() => setEditing("new")}>
                  <Plus /> Add someone
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((e) => (
            <li key={e.id} className="relative">
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => setEditing(e)}
                aria-label={`${e.name}. Edit`}
                className="focus-ring flex h-full w-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 pb-14 text-left shadow-card enabled:hover:border-line-strong"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-display text-lg font-bold text-fg-heading">{e.name}</span>
                    <span className="block text-sm text-fg-muted">{e.job || PAY_TYPE_LABELS[e.payType]}</span>
                  </span>
                  {e.status === "left" ? <Badge>Left</Badge> : e.hasLogin && <Badge tone="info">Uses Fowlex</Badge>}
                </span>
                <span className="num text-sm font-semibold text-fg">{payLine(e)}</span>
                {e.bank ? (
                  <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <Landmark className="size-3.5" aria-hidden /> {e.bank.bankName} {maskAccount(e.bank.accountNumber)}
                  </span>
                ) : (
                  <span className="text-xs text-warning-fg">No bank account: add one to pay them from here</span>
                )}
              </button>
              {e.phone && (
                <a
                  href={`tel:${e.phone}`}
                  className="focus-ring absolute bottom-3 left-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-fg hover:bg-brand-subtle"
                >
                  <Phone className="size-4" aria-hidden /> {formatPhone(e.phone)}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {employees.some((e) => e.status === "left") && (
        <button
          type="button"
          className="focus-ring rounded-md text-sm font-medium text-brand-fg"
          onClick={() => setShowLeft((v) => !v)}
        >
          {showLeft ? "Hide people who left" : "Show people who left"}
        </button>
      )}
      {canWrite && <Fab label="Add someone" icon={<Plus />} onClick={() => setEditing("new")} />}
      {editing && (
        <EmployeeSheet
          key={editing === "new" ? "new" : editing.id}
          employee={editing === "new" ? null : editing}
          batches={batches}
          today={today}
          canInvite={canInvite}
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

function EmployeeSheet({
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
  onSaved: (message: string) => void;
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
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const errors = validateEmployee(v, { today });
  const show = (f: keyof EmployeeInput) => (submitted ? errors[f] : failure?.field === f ? failure.message : undefined);
  const set = <K extends keyof EmployeeInput>(k: K, value: EmployeeInput[K]) => setV((d) => ({ ...d, [k]: value }));
  const bankUnfinished = ["partial", "checking", "not-found", "unavailable"].includes(bankState);

  const call = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await fn();
      onSaved(message);
    } catch (e) {
      setFailure(e as AuthError);
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    setSubmitted(true);
    if (Object.keys(errors).length || bankUnfinished) {
      document.getElementById(Object.keys(errors)[0] ?? "accountNumber")?.focus();
      return;
    }
    void call(
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
      onClose={() => !busy && onClose()}
      title={employee ? employee.name : "Add someone"}
      subtitle={employee ? payLine(employee) : "Someone who works on the farm"}
      footer={
        <div className="space-y-2">
          <Button size="lg" fullWidth loading={busy} onClick={save}>
            {employee ? "Save changes" : "Add"}
          </Button>
          {employee && (
            <div className="grid grid-cols-2 gap-2">
              {canInvite && employee.status === "active" && employee.email && !employee.hasLogin && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void call(
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
                onClick={() =>
                  void call(
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
        {failure && !failure.field && <FormAlert title={failure.message} />}
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
            error={
              submitted && bankUnfinished
                ? "Finish the bank account so the bank can name it, or clear both fields."
                : show("bank")
            }
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
