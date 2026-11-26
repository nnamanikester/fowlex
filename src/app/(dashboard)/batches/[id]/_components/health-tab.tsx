"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pill, Plus, Stethoscope, Syringe, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field, FormAlert } from "@/components/auth";
import { ConfirmDialog, EmptyState, Panel } from "@/components/kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import type { BatchView } from "@/lib/batches/service";
import { formatRange } from "@/lib/dates";
import {
  type Dose,
  type DoseState,
  HEALTH_KINDS,
  type HealthInput,
  type HealthKind,
  KIND_LABELS,
  ROUTES,
  validateHealth,
  withdrawalEnds,
} from "@/lib/health/rules";
import type { HealthView } from "@/lib/health/service";
import { formatNaira } from "@/lib/money";

const day = (d: string) => formatRange({ from: d, to: d });
const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export const DOSE_STATE: Record<DoseState, { label: string; tone: BadgeTone }> = {
  given: { label: "Given", tone: "success" },
  due: { label: "Due", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  "before-arrival": { label: "Before arrival", tone: "neutral" },
};
const KIND_ICON: Record<HealthKind, React.ReactNode> = {
  vaccination: <Syringe />,
  medication: <Pill />,
  "vet-visit": <Stethoscope />,
};

type Draft = Omit<HealthInput, "batchId">;

/** The batch's vaccination programme, and every vaccination, drug and vet visit recorded. */
export function HealthTab({
  batch,
  plan,
  events,
  today,
  canLog,
  canWrite,
}: {
  batch: BatchView;
  plan: Dose[];
  events: HealthView[];
  today: string;
  canLog: boolean;
  canWrite: boolean;
}) {
  const [sheet, setSheet] = React.useState<{ event?: HealthView; draft: Draft } | null>(null);
  const blank = (over: Partial<Draft> = {}): Draft => ({
    date: today,
    kind: "vaccination",
    product: "",
    scheduleKey: null,
    route: "",
    dose: "",
    givenBy: "",
    costKobo: 0,
    withdrawalDays: 0,
    notes: "",
    ...over,
  });
  const record = (d: Dose) =>
    setSheet({
      draft: blank({ kind: "vaccination", scheduleKey: d.key, product: d.vaccine, route: d.route }),
    });

  return (
    <div className="space-y-4">
      <Panel
        title="Vaccination programme"
        description="Newcastle and Gumboro, on the days most Nigerian broiler farms use."
        flush
      >
        <ul className="divide-y divide-line">
          {plan.map((d) => (
            <li key={d.key} className="flex items-center gap-3 px-5 py-3.5">
              <span className="num grid size-11 shrink-0 place-items-center rounded-xl bg-surface-muted text-center text-[11px] font-semibold leading-tight text-fg-muted">
                Day
                <span className="block text-base text-fg">{d.day}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-fg">{d.vaccine}</span>
                  <Badge tone={DOSE_STATE[d.state].tone} dot>
                    {DOSE_STATE[d.state].label}
                  </Badge>
                </span>
                <span className="block text-xs text-fg-muted">
                  {d.route} ·{" "}
                  {d.state === "given"
                    ? `given ${day(d.givenOn!)}`
                    : d.state === "before-arrival"
                      ? "due before the birds arrived"
                      : `${d.state === "overdue" ? "was due" : "due"} ${day(d.dueOn)}`}
                </span>
              </span>
              {canLog && (d.state === "due" || d.state === "overdue") && (
                <Button size="sm" onClick={() => record(d)} aria-label={`Record ${d.vaccine}`}>
                  Record
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Health record"
        flush
        actions={
          canLog ? (
            <Button size="sm" variant="secondary" onClick={() => setSheet({ draft: blank({ kind: "medication" }) })}>
              <Plus /> Add
            </Button>
          ) : undefined
        }
      >
        {events.length ? (
          <ul className="divide-y divide-line">
            {events.map((e) => {
              const ends = withdrawalEnds(e);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={!canLog}
                    onClick={() => setSheet({ event: e, draft: { ...e } })}
                    className="focus-ring flex w-full items-start gap-3 px-5 py-3.5 text-left enabled:hover:bg-surface-subtle"
                  >
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand-fg [&_svg]:size-4">
                      {KIND_ICON[e.kind]}
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block font-semibold text-fg">
                        {e.product || KIND_LABELS[e.kind]}
                        <span className="font-normal text-fg-subtle"> · {day(e.date)}</span>
                      </span>
                      <span className="block text-sm text-fg-muted">
                        {[
                          KIND_LABELS[e.kind],
                          e.route,
                          e.dose,
                          e.givenBy && `by ${e.givenBy}`,
                          e.costKobo > 0 && formatNaira(e.costKobo),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {ends && (
                        <span
                          className={
                            ends >= today ? "block text-sm font-medium text-warning-fg" : "block text-sm text-fg-subtle"
                          }
                        >
                          No sale until after {day(ends)}
                        </span>
                      )}
                      {e.notes && <span className="block text-sm text-fg-subtle">{e.notes}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={<Syringe />}
            title="Nothing recorded yet"
            description="Vaccinations, drugs and vet visits for this batch show here."
          />
        )}
      </Panel>

      {sheet && (
        <HealthSheet
          key={sheet.event?.id ?? sheet.draft.scheduleKey ?? sheet.draft.kind}
          batch={batch}
          plan={plan}
          event={sheet.event}
          initial={sheet.draft}
          today={today}
          canDelete={canWrite}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

function HealthSheet({
  batch,
  plan,
  event,
  initial,
  today,
  canDelete,
  onClose,
}: {
  batch: BatchView;
  plan: Dose[];
  event?: HealthView;
  initial: Draft;
  today: string;
  canDelete: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [v, setV] = React.useState<Draft>(initial);
  const [submitted, setSubmitted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [requestId] = React.useState(newRequestId);

  const set = <K extends keyof Draft>(name: K, value: Draft[K]) => setV((d) => ({ ...d, [name]: value }));
  const errors = validateHealth({ ...v, batchId: batch.id }, { today, placedOn: batch.placedOn });
  const show = (name: keyof Draft) => (submitted ? errors[name] : undefined);
  // Doses still to give, plus the one this record already counts as.
  const doses = plan.filter((d) => d.state !== "given" || d.key === event?.scheduleKey);

  const save = async () => {
    setSubmitted(true);
    setFailure(null);
    const first = Object.keys(errors)[0];
    if (first) {
      document.getElementById(`health-${first}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const body = { ...v, batchId: batch.id };
      if (event) await apiRequest(`/api/health/${event.id}`, "PATCH", { ...body, version: event.version });
      else await apiRequest("/api/health", "POST", { ...body, requestId });
      toast.success(event ? "Health record updated." : `${v.product || KIND_LABELS[v.kind]} recorded.`);
      router.refresh();
      onClose();
    } catch (e) {
      setFailure(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await apiRequest(`/api/health/${event!.id}`, "DELETE");
      toast.success("Health record deleted.");
      router.refresh();
      onClose();
    } catch (e) {
      toast.error((e as AuthError).message);
    }
  };

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title={event ? "Edit health record" : "Record health"}
      subtitle={`${batch.code} · ${batch.houseName}`}
      footer={
        <div className="space-y-2">
          <Button type="submit" form="health-form" size="lg" fullWidth loading={busy}>
            {event ? "Save changes" : "Save"}
          </Button>
          {event && canDelete && (
            <Button variant="ghost" fullWidth onClick={() => setDeleting(true)}>
              <Trash2 /> Delete record
            </Button>
          )}
        </div>
      }
    >
      <form
        id="health-form"
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {failure && <FormAlert title={failure.message} />}
        <Segmented
          label="What happened"
          value={v.kind}
          onChange={(kind) =>
            setV((d) => ({
              ...d,
              kind,
              scheduleKey: kind === "vaccination" ? d.scheduleKey : null,
              withdrawalDays: kind === "medication" ? d.withdrawalDays : 0,
            }))
          }
          options={HEALTH_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
          className="w-full"
        />

        {v.kind === "vaccination" && (
          <Field id="health-scheduleKey" label="Programme dose" error={show("scheduleKey")}>
            {(a11y) => (
              <Select
                {...a11y}
                value={v.scheduleKey ?? ""}
                onChange={(e) => {
                  const dose = plan.find((d) => d.key === e.target.value);
                  setV((d) => ({
                    ...d,
                    scheduleKey: dose?.key ?? null,
                    product: dose ? dose.vaccine : d.product,
                    route: dose ? dose.route : d.route,
                  }));
                }}
              >
                {doses.map((d) => (
                  <option key={d.key} value={d.key}>
                    Day {d.day}: {d.vaccine}
                  </option>
                ))}
                <option value="">Not in the programme</option>
              </Select>
            )}
          </Field>
        )}

        <Field
          id="health-product"
          label={v.kind === "vet-visit" ? "Vet or clinic" : v.kind === "vaccination" ? "Vaccine" : "Drug"}
          error={show("product")}
          hint={v.kind === "vet-visit" ? "Optional" : undefined}
        >
          {(a11y) => (
            <Input
              {...a11y}
              value={v.product}
              maxLength={120}
              placeholder={v.kind === "medication" ? "Amprolium" : undefined}
              onChange={(e) => set("product", e.target.value)}
            />
          )}
        </Field>

        {v.kind !== "vet-visit" && (
          <div className="grid grid-cols-2 gap-3">
            <Field id="health-route" label="Method" error={show("route")}>
              {(a11y) => (
                <Select {...a11y} value={v.route} onChange={(e) => set("route", e.target.value)}>
                  <option value="">Choose…</option>
                  {[...new Set([...ROUTES, v.route].filter(Boolean))].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="health-dose" label="Dose" error={show("dose")} hint="Optional">
              {(a11y) => (
                <Input
                  {...a11y}
                  value={v.dose}
                  maxLength={120}
                  placeholder="1 vial / 1,000"
                  onChange={(e) => set("dose", e.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        {v.kind === "medication" && (
          <Field
            id="health-withdrawalDays"
            label="Withdrawal (days)"
            error={show("withdrawalDays")}
            hint="On the label. Birds can't be sold for meat until it's over."
          >
            {(a11y) => (
              <Input
                {...a11y}
                inputMode="numeric"
                className="num"
                value={Number.isFinite(v.withdrawalDays) ? String(v.withdrawalDays) : ""}
                onChange={(e) =>
                  set("withdrawalDays", e.target.value === "" ? 0 : Number(e.target.value.replace(/\D/g, "")))
                }
              />
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field id="health-date" label="Date" error={show("date")}>
            {(a11y) => (
              <Input
                {...a11y}
                type="date"
                value={v.date}
                min={batch.placedOn}
                max={today}
                onChange={(e) => set("date", e.target.value)}
              />
            )}
          </Field>
          <Field id="health-costKobo" label="Cost" error={show("costKobo")} hint="Optional">
            {(a11y) => (
              <MoneyInput
                {...a11y}
                value={v.costKobo || null}
                onChange={(k) => set("costKobo", k ?? 0)}
                placeholder="0.00"
              />
            )}
          </Field>
        </div>

        <Field id="health-givenBy" label="Done by" error={show("givenBy")} hint="Optional">
          {(a11y) => (
            <Input {...a11y} value={v.givenBy} maxLength={120} onChange={(e) => set("givenBy", e.target.value)} />
          )}
        </Field>

        <Field
          id="health-notes"
          label="Notes"
          error={show("notes")}
          hint={v.kind === "vet-visit" ? "What the vet found and advised" : "Optional"}
        >
          {(a11y) => (
            <Textarea
              {...a11y}
              rows={3}
              maxLength={500}
              value={v.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          )}
        </Field>
      </form>

      {event && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          onConfirm={remove}
          title="Delete this health record?"
          description="It stays in the audit log. A programme dose shows as not given again."
          confirmLabel="Delete record"
        />
      )}
    </Sheet>
  );
}
