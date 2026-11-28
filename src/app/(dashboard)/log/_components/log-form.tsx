"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, CloudOff, LoaderCircle, Plus, RotateCw, X } from "lucide-react";
import { toast } from "sonner";

import { Field, FormAlert } from "@/components/auth";
import { HealthAlerts } from "@/components/health-alerts";
import { EmptyState, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { ageOn } from "@/lib/batches/rules";
import type { BatchView } from "@/lib/batches/service";
import { addDays, formatRange } from "@/lib/dates";
import { needsAttention, vaccinationPlan, withdrawalUntil } from "@/lib/health/rules";
import type { HealthView } from "@/lib/health/service";
import { useLogOutbox } from "@/lib/logs/outbox";
import { quantity, type Unit } from "@/lib/inventory/rules";
import {
  bags,
  FEED_TYPES,
  type LogInput,
  type Span,
  SPAN_LABELS,
  SPANS,
  spanChoices,
  spanDays,
  spanLabel,
  suggestedFeed,
  validateLog,
} from "@/lib/logs/rules";
import type { LogView } from "@/lib/logs/service";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

type Values = Omit<LogInput, "batchId" | "date" | "endDate">;
/** A feed item a log can take from: id, name, kg in a unit, and what's left. */
export type FeedStock = { id: string; name: string; unit: string; unitKg: number | null; onHand: number };
/** Anything else a log can take from stock: drugs, vaccines, disinfectant, litter, fuel… */
export type SupplyStock = { id: string; name: string; unit: string; category: string; onHand: number };

/** The feed for this age: the stock item named after it (Starter, Finisher…), else the first. */
function feedFor(age: number, feeds: FeedStock[]) {
  const type = suggestedFeed(age);
  const item = feeds.find((f) => f.name.toLowerCase().includes(type.toLowerCase())) ?? feeds[0];
  return item ? { feedType: item.name, feedItemId: item.id } : { feedType: type, feedItemId: null };
}

const blank = ({ feedType, feedItemId }: { feedType: string; feedItemId: string | null }): Values => ({
  deaths: 0,
  culls: 0,
  sold: 0,
  feedKg: Number.NaN,
  feedType,
  feedItemId,
  waterLitres: null,
  avgWeightGrams: null,
  notes: "",
  supplies: [],
});
const fromLog = (l: LogView): Values => ({
  deaths: l.deaths,
  culls: l.culls,
  sold: l.sold,
  feedKg: l.feedKg,
  feedType: l.feedType,
  feedItemId: l.feedItemId,
  waterLitres: l.waterLitres,
  avgWeightGrams: l.avgWeightGrams,
  notes: l.notes,
  supplies: l.supplies ?? [],
});
const day = (d: string) => formatRange({ from: d, to: d });

/**
 * The staff's daily log, built for a phone in a poultry house: pick the batch and day, tap the
 * counts, enter feed, save. An existing log for that day opens for editing. With no signal, the
 * log waits on the phone and sends itself later.
 */
export function LogForm({
  batches,
  recent,
  health = [],
  feeds = [],
  stock = [],
  today,
}: {
  /** Everything else in stock a log can use (not feed, not chicks). */
  stock?: SupplyStock[];
  batches: BatchView[];
  recent: LogView[];
  health?: HealthView[];
  /** Feed items in stock; when there are any, the log takes its feed from one. */
  feeds?: FeedStock[];
  today: string;
}) {
  const router = useRouter();
  const { batch: chosen } = useWorkspace();
  const asked = useSearchParams().get("batch");
  // The batch asked for in the link, else the one chosen in the sidebar, else the first.
  const [batchId, setBatchId] = React.useState(
    () =>
      batches.find((b) => b.id === asked)?.id ?? batches.find((b) => b.id === chosen?.id)?.id ?? batches[0]?.id ?? "",
  );
  const [date, setDate] = React.useState(today);
  // A day, or a week or month logged together (counted from the farm's notebook, say).
  const [span, setSpan] = React.useState<Span>("day");
  const [endDate, setEndDate] = React.useState<string | null>(null);
  // Doses ticked as given on this log, with the vaccine taken from stock if one is chosen.
  const [vaccines, setVaccines] = React.useState<Record<string, { itemId: string; quantity: string }>>({});
  const [fetched, setFetched] = React.useState<LogView[]>([]);
  const [saved, setSaved] = React.useState<LogView[]>([]);
  const [requestId, setRequestId] = React.useState(newRequestId);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const [submitted, setSubmitted] = React.useState(false);

  const outbox = useLogOutbox({
    onSent: (n) => {
      toast.success(
        n === 1 ? "The log saved on this phone has been sent." : `${n} logs saved on this phone have been sent.`,
      );
      router.refresh();
    },
  });

  const batch = batches.find((b) => b.id === batchId);
  const known = [...saved, ...fetched, ...recent];
  const existing = known.find(
    // Compared by last day: a "week" that is only today so far is saved as a day.
    (l) => l.batchId === batchId && l.date === date && (l.endDate ?? l.date) === (span === "day" ? date : endDate),
  );
  // A day inside a week or month already logged: that log is where its numbers are.
  const covering = known.find(
    (l) => l.batchId === batchId && l.endDate && l.date <= date && l.endDate >= date && l !== existing,
  );
  const choices = batch && span !== "day" ? spanChoices(span, today, batch.placedOn) : [];
  const pickSpan = (next: Span) => {
    setSpan(next);
    if (next === "day") {
      setEndDate(null);
      setDate(today);
    } else if (batch) {
      const [first] = spanChoices(next, today, batch.placedOn);
      setDate(first?.from ?? today);
      setEndDate(first?.to ?? today);
    }
  };
  const days = span === "day" ? 1 : spanDays(date, endDate);
  const over = days > 1 ? ` (all ${days} days)` : "";
  const age = batch ? ageOn(batch, date) : 0;
  const feedLeft = (id: string | null) => {
    const item = feeds.find((f) => f.id === id);
    return item ? `${quantity(item.onHand, item.unit as Unit)} left` : undefined;
  };

  const [values, setValues] = React.useState<Values>(() => (existing ? fromLog(existing) : blank(feedFor(age, feeds))));
  // Switching batch or day loads that day's log, or a blank one: reset while rendering.
  const key = `${batchId}|${date}|${endDate}|${existing?.id ?? ""}|${existing?.version ?? ""}`;
  const [shownKey, setShownKey] = React.useState(key);
  if (key !== shownKey) {
    setShownKey(key);
    setValues(existing ? fromLog(existing) : blank(feedFor(age, feeds)));
    setVaccines({});
    setFailure(null);
    setSubmitted(false);
  }

  // A day further back than yesterday isn't in the page: ask the server for it.
  // The server's answer for one batch, day and attempt; until it comes, that day is "loading".
  const [dayAttempt, setDayAttempt] = React.useState(0);
  const [dayAnswer, setDayAnswer] = React.useState<{ key: string; ok: boolean } | null>(null);
  const dayKey = `${batchId}|${date}|${dayAttempt}`;
  const needsDay = !!batchId && date < addDays(today, -1);
  React.useEffect(() => {
    if (!needsDay) return;
    let live = true;
    apiRequest<LogView[]>(`/api/logs?batchId=${batchId}&date=${date}`, "GET").then(
      (logs) => {
        if (!live) return;
        setFetched((f) => [...logs, ...f]);
        setDayAnswer({ key: dayKey, ok: true });
      },
      () => live && setDayAnswer({ key: dayKey, ok: false }),
    );
    return () => {
      live = false;
    };
  }, [needsDay, batchId, date, dayKey]);
  const dayState = !needsDay ? null : dayAnswer?.key !== dayKey ? "loading" : dayAnswer.ok ? null : "failed";

  if (!batches.length)
    return (
      <Panel>
        <EmptyState
          icon={<CircleCheck />}
          title="No batches to log"
          description="Logs are kept for batches that are growing or selling. Once chicks are placed, their batch shows here."
        />
      </Panel>
    );

  const span_ = span === "day" ? null : endDate;
  const errors = validateLog({ ...values, batchId, date, endDate: span_ }, { today, placedOn: batch?.placedOn });
  const show = (name: keyof LogInput) =>
    failure?.field === name ? failure.message : submitted ? errors[name] : undefined;
  const set = <K extends keyof Values>(name: K, value: Values[K]) => setValues((v) => ({ ...v, [name]: value }));
  const loggedOn = (id: string) => known.some((l) => l.batchId === id && l.date === date);

  const save = async () => {
    setSubmitted(true);
    setFailure(null);
    if (Object.keys(errors).length) {
      document.getElementById(Object.keys(errors)[0])?.focus();
      return;
    }
    const body = {
      ...values,
      batchId,
      date,
      endDate: span_,
      vaccines: Object.entries(vaccines).map(([scheduleKey, v]) => ({
        scheduleKey,
        itemId: v.itemId || null,
        quantity: v.itemId && Number(v.quantity) > 0 ? Number(v.quantity) : null,
      })),
    };
    setBusy(true);
    try {
      const log = existing
        ? await apiRequest<LogView>(`/api/logs/${existing.id}`, "PATCH", { ...body, version: existing.version })
        : await apiRequest<LogView>("/api/logs", "POST", { ...body, requestId });
      setSaved((s) => [log, ...s.filter((l) => l.id !== log.id)]);
      setVaccines({});
      setRequestId(newRequestId());
      const when = span_
        ? (choices.find((c) => c.from === date)?.label.toLowerCase() ?? spanLabel(date, span_))
        : date === today
          ? "today"
          : day(date);
      toast.success(`${existing ? "Updated" : "Logged"} ${batch!.code} for ${when}.`);
      router.refresh();
    } catch (e) {
      const error = e as AuthError;
      if (error.status === 0 && !existing) {
        outbox.enqueue({
          requestId,
          body,
          label: `${batch!.code}, ${span_ ? spanLabel(date, span_) : day(date)}`,
          savedAt: new Date().toISOString(),
        });
        setRequestId(newRequestId());
        setValues(blank(feedFor(age, feeds)));
        setSubmitted(false);
        toast.message("No signal: saved on this phone. It sends by itself when you're back online.");
      } else if (error.code === "already_logged") {
        // Logged from another phone a moment ago: load it to edit.
        const logs = await apiRequest<LogView[]>(`/api/logs?batchId=${batchId}&date=${date}`, "GET").catch(() => []);
        setFetched((f) => [...logs, ...f]);
        setFailure({
          ...error,
          message: "Someone just logged this day from another phone. It's open now: check it, then save.",
        });
      } else setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      className="space-y-6 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {outbox.queued.length > 0 && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-warning-line bg-warning-subtle px-4 py-3 text-sm"
        >
          <CloudOff className="size-5 shrink-0 text-warning-fg" aria-hidden />
          <span className="flex-1 text-fg">
            {outbox.queued.length === 1 ? "1 log is" : `${outbox.queued.length} logs are`} saved on this phone, waiting
            for a signal. {outbox.queued.length === 1 ? "It sends" : "They send"} by itself.
          </span>
          <Button size="sm" variant="secondary" loading={outbox.sending} onClick={() => void outbox.flush()}>
            <RotateCw /> Send now
          </Button>
        </div>
      )}
      {outbox.failed.map((f) => (
        <FormAlert key={f.requestId} title={`${f.label} couldn't be sent`}>
          <p>{f.message}</p>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 font-semibold"
            onClick={() => outbox.dismiss(f.requestId)}
          >
            <X className="size-3.5" aria-hidden /> Dismiss
          </button>
        </FormAlert>
      ))}

      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-semibold text-fg">Batch</legend>
        <div
          role="radiogroup"
          aria-label="Batch"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0"
        >
          {batches.map((b) => {
            const selected = b.id === batchId;
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setBatchId(b.id)}
                className={cn(
                  "focus-ring flex min-w-36 shrink-0 flex-col items-start rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                  selected ? "border-brand bg-brand-subtle" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-fg">{b.code}</span>
                  {loggedOn(b.id) && <CircleCheck className="size-4 text-success-fg" aria-label="Logged" />}
                </span>
                <span className="text-xs text-fg-muted">
                  {b.houseName} · Day {ageOn(b, date)}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      {batch && (
        <HealthAlerts
          attention={needsAttention(
            vaccinationPlan(
              batch,
              new Map(
                health.filter((e) => e.batchId === batch.id && e.scheduleKey).map((e) => [e.scheduleKey!, e.date]),
              ),
              today,
            ),
          )}
          withdrawal={withdrawalUntil(
            health.filter((e) => e.batchId === batch.id),
            today,
          )}
          href={`/batches/${batch.id}?tab=health`}
        />
      )}

      <div className="space-y-2">
        <span className="text-sm font-semibold text-fg">How long is this log for?</span>
        <Segmented
          label="How long it covers"
          value={span}
          onChange={pickSpan}
          options={SPANS.map((v) => ({ value: v, label: SPAN_LABELS[v] }))}
        />
        {span === "day" ? null : (
          <p className="text-sm text-fg-muted">
            For a {span}&apos;s numbers counted together. Enter the totals for the whole {span}.
          </p>
        )}
      </div>

      {span !== "day" ? (
        <div className="space-y-2">
          <span id="span-label" className="text-sm font-semibold text-fg">
            Which {span}?
          </span>
          <div role="radiogroup" aria-labelledby="span-label" className="grid gap-2 sm:grid-cols-2">
            {choices.map((c) => {
              const on = c.from === date && c.to === endDate;
              return (
                <button
                  key={c.from}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setDate(c.from);
                    setEndDate(c.to);
                  }}
                  className={cn(
                    "focus-ring flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                    on ? "border-brand bg-brand-subtle" : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <span className="space-y-0.5">
                    <span className="block font-semibold text-fg">{c.label}</span>
                    <span className="num block text-xs text-fg-muted">
                      {spanLabel(c.from, c.to)} · {spanDays(c.from, c.to)} days
                    </span>
                  </span>
                  {known.some((l) => l.batchId === batchId && l.date === c.from && (l.endDate ?? l.date) === c.to) && (
                    <CircleCheck className="size-4 shrink-0 text-success-fg" aria-label="Logged" />
                  )}
                </button>
              );
            })}
          </div>
          {(show("date") || show("endDate")) && (
            <p className="text-[13px] font-medium text-danger-fg">{show("date") ?? show("endDate")}</p>
          )}
          {existing && (
            <p className="text-sm text-info-fg">
              {batch?.code} is already logged for {spanLabel(date, endDate)}. You&apos;re editing that log.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <span className="text-sm font-semibold text-fg">Day</span>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Day"
              value={date === today ? "today" : date === addDays(today, -1) ? "yesterday" : "other"}
              onChange={(v) => v !== "other" && setDate(v === "today" ? today : addDays(today, -1))}
              options={[
                { value: "today", label: "Today" },
                { value: "yesterday", label: "Yesterday" },
                { value: "other", label: "Other" },
              ]}
            />
            <Input
              type="date"
              aria-label="Date"
              id="date"
              value={date}
              min={batch?.placedOn}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="w-auto"
            />
          </div>
          {show("date") && <p className="text-[13px] font-medium text-danger-fg">{show("date")}</p>}
          {dayState === "loading" && !existing && (
            <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Checking for a log on that day…
            </p>
          )}
          {dayState === "failed" && !existing && (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-warning-fg">
              We couldn&apos;t check whether that day is already logged.
              <button
                type="button"
                onClick={() => setDayAttempt((a) => a + 1)}
                className="focus-ring rounded-md font-semibold text-brand-fg"
              >
                Try again
              </button>
            </p>
          )}
          {existing && (
            <p className="text-sm text-info-fg">
              {batch?.code} is already logged for {date === today ? "today" : day(date)}. You&apos;re editing that log.
            </p>
          )}
          {covering && !existing && (
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-info-fg">
              This day is in the log for {spanLabel(covering.date, covering.endDate)}.
              <button
                type="button"
                className="focus-ring rounded font-semibold text-brand-fg"
                onClick={() => {
                  setSpan(spanDays(covering.date, covering.endDate) > 8 ? "month" : "week");
                  setDate(covering.date);
                  setEndDate(covering.endDate);
                }}
              >
                Open it
              </button>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="deaths" label={`Deaths${over}`} error={show("deaths")}>
          {(a11y) => (
            <Stepper
              id={a11y.id}
              label="Death"
              value={values.deaths}
              onChange={(n) => set("deaths", n)}
              invalid={a11y["aria-invalid"]}
              describedBy={a11y["aria-describedby"]}
            />
          )}
        </Field>
        <Field id="culls" label={`Culls${over}`} error={show("culls")} hint="Removed sick or weak">
          {(a11y) => (
            <Stepper
              id={a11y.id}
              label="Cull"
              value={values.culls}
              onChange={(n) => set("culls", n)}
              invalid={a11y["aria-invalid"]}
              describedBy={a11y["aria-describedby"]}
            />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id="feedKg"
          label={`Feed used (kg)${over}`}
          error={show("feedKg")}
          hint={Number.isFinite(values.feedKg) && values.feedKg > 0 ? `= ${bags(values.feedKg)}` : "25 kg a bag"}
        >
          {(a11y) => (
            <Input
              {...a11y}
              inputMode="decimal"
              className="num h-14 text-xl"
              placeholder="0"
              value={Number.isFinite(values.feedKg) ? String(values.feedKg) : ""}
              onChange={(e) => set("feedKg", e.target.value === "" ? Number.NaN : Number(e.target.value))}
            />
          )}
        </Field>
        {feeds.length ? (
          <Field id="feedItemId" label="Feed" error={show("feedItemId")} hint={feedLeft(values.feedItemId)}>
            {(a11y) => (
              <Select
                {...a11y}
                className="h-14"
                value={values.feedItemId ?? ""}
                onChange={(e) => {
                  const item = feeds.find((f) => f.id === e.target.value);
                  setValues((v) => ({
                    ...v,
                    feedItemId: item?.id ?? null,
                    feedType: item?.name ?? suggestedFeed(age),
                  }));
                }}
              >
                {feeds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
                <option value="">Not from stock</option>
              </Select>
            )}
          </Field>
        ) : (
          <Field id="feedType" label="Feed" error={show("feedType")}>
            {(a11y) => (
              <Select
                {...a11y}
                className="h-14"
                value={values.feedType}
                onChange={(e) => set("feedType", e.target.value)}
              >
                {[...new Set([...FEED_TYPES, values.feedType].filter(Boolean))].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>

      <Field id="waterLitres" label="Water (litres)" error={show("waterLitres")} hint="Optional">
        {(a11y) => (
          <Input
            {...a11y}
            inputMode="decimal"
            className="num"
            value={values.waterLitres === null ? "" : String(values.waterLitres)}
            onChange={(e) => set("waterLitres", e.target.value === "" ? null : Number(e.target.value))}
          />
        )}
      </Field>

      {batch && (
        <VaccinesDue
          due={needsAttention(
            vaccinationPlan(
              batch,
              new Map(
                health.filter((e) => e.batchId === batch.id && e.scheduleKey).map((e) => [e.scheduleKey!, e.date]),
              ),
              span_ ?? date,
            ),
          )}
          stock={stock.filter((i) => i.category === "vaccine")}
          ticked={vaccines}
          onChange={setVaccines}
        />
      )}

      <SuppliesUsed
        stock={stock}
        supplies={values.supplies}
        onChange={(supplies) => set("supplies", supplies)}
        error={show("supplies")}
        over={over}
      />

      <details className="rounded-xl border border-line px-4 py-3" open={values.avgWeightGrams !== null}>
        <summary className="cursor-pointer text-sm font-semibold text-fg">Weighed some birds?</summary>
        <div className="pt-3">
          <Field
            id="avgWeightGrams"
            label="Average weight (kg)"
            error={show("avgWeightGrams")}
            hint="Weigh 10 or more birds from different spots and divide."
          >
            {(a11y) => (
              <Input
                {...a11y}
                inputMode="decimal"
                className="num"
                placeholder="1.25"
                value={values.avgWeightGrams === null ? "" : String(values.avgWeightGrams / 1000)}
                onChange={(e) =>
                  set("avgWeightGrams", e.target.value === "" ? null : Math.round(Number(e.target.value) * 1000))
                }
              />
            )}
          </Field>
        </div>
      </details>

      <details className="rounded-xl border border-line px-4 py-3" open={values.sold > 0}>
        <summary className="cursor-pointer text-sm font-semibold text-fg">Birds taken for sale?</summary>
        <div className="pt-3">
          <Field
            id="sold"
            label="Birds taken"
            error={show("sold")}
            hint="Taken by buyers today without a sales order: birds on orders come off by themselves"
          >
            {(a11y) => (
              <Stepper
                id={a11y.id}
                label="Bird taken"
                value={values.sold}
                onChange={(n) => set("sold", n)}
                invalid={a11y["aria-invalid"]}
                describedBy={a11y["aria-describedby"]}
              />
            )}
          </Field>
        </div>
      </details>

      <Field id="notes" label="Notes" error={show("notes")} hint="Optional: anything unusual">
        {(a11y) => (
          <Textarea
            {...a11y}
            rows={2}
            maxLength={500}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        )}
      </Field>

      {/* Above the tab bar on phones, in thumb's reach. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 bg-canvas/90 px-4 py-3 backdrop-blur-md md:mx-0 md:px-0 lg:bottom-0">
        <ActionFeedback action={{ failure }} className="mb-2" />
        <Button type="submit" size="lg" fullWidth loading={busy}>
          {existing
            ? "Save changes"
            : span_
              ? `Save log for ${choices.find((c) => c.from === date)?.label.toLowerCase() ?? spanLabel(date, span_)}`
              : `Save log for ${date === today ? "today" : day(date)}`}
        </Button>
      </div>
    </form>
  );
}

/**
 * Doses due or overdue on the day (or by the end of the week) logged: tick the ones given. Each
 * goes on the batch's health record, the vaccine taken from stock when one is chosen.
 */
function VaccinesDue({
  due,
  stock,
  ticked,
  onChange,
}: {
  due: ReturnType<typeof needsAttention>;
  stock: SupplyStock[];
  ticked: Record<string, { itemId: string; quantity: string }>;
  onChange: (next: Record<string, { itemId: string; quantity: string }>) => void;
}) {
  if (!due.length) return null;
  const toggle = (key: string) => {
    const next = { ...ticked };
    if (next[key]) delete next[key];
    else next[key] = { itemId: stock.length === 1 ? stock[0].id : "", quantity: stock.length === 1 ? "1" : "" };
    onChange(next);
  };
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">Vaccines due</h2>
        <p className="text-sm text-fg-muted">Tick the ones given. They go on the batch&apos;s health record.</p>
      </div>
      <ul className="space-y-2">
        {due.map((d) => {
          const on = ticked[d.key];
          return (
            <li
              key={d.key}
              className={cn("rounded-xl border p-3", on ? "border-brand bg-brand-subtle" : "border-line bg-surface")}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={!!on}
                  onChange={() => toggle(d.key)}
                  className="focus-ring mt-0.5 size-5 shrink-0 accent-[rgb(var(--brand))]"
                />
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-semibold text-fg">{d.vaccine} given</span>
                  <span className="block text-xs text-fg-muted">
                    {d.disease} · {d.route.toLowerCase()} · {d.state === "overdue" ? "overdue since" : "due"}{" "}
                    {formatRange({ from: d.dueOn, to: d.dueOn })}
                  </span>
                </span>
              </label>
              {on && stock.length > 0 && (
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_7rem] gap-2 pl-8">
                  <Select
                    aria-label={`${d.vaccine} from stock`}
                    value={on.itemId}
                    onChange={(e) => onChange({ ...ticked, [d.key]: { ...on, itemId: e.target.value } })}
                  >
                    <option value="">Not from stock</option>
                    {stock.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({quantity(i.onHand, i.unit as Unit)} left)
                      </option>
                    ))}
                  </Select>
                  {on.itemId && (
                    <Input
                      aria-label={`${d.vaccine} used`}
                      inputMode="decimal"
                      className="num"
                      value={on.quantity}
                      placeholder="1"
                      onChange={(e) =>
                        onChange({
                          ...ticked,
                          [d.key]: { ...on, quantity: e.target.value.replace(/[^\d.]/g, "").slice(0, 8) },
                        })
                      }
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Everything else used from stock, like feed: drugs, disinfectant, litter, fuel. Each comes off
 * stock and is charged to the batch.
 */
function SuppliesUsed({
  stock,
  supplies,
  onChange,
  error,
  over,
}: {
  stock: SupplyStock[];
  supplies: LogInput["supplies"];
  onChange: (next: LogInput["supplies"]) => void;
  error?: string;
  /** " (all 7 days)" when the log covers a span. */
  over: string;
}) {
  const [rows, setRows] = React.useState(() => supplies.map((s) => ({ itemId: s.itemId, qty: String(s.quantity) })));
  // A different log loaded: its things used replace the rows.
  const [seen, setSeen] = React.useState(supplies);
  if (seen !== supplies && JSON.stringify(seen) !== JSON.stringify(supplies)) {
    setSeen(supplies);
    setRows(supplies.map((s) => ({ itemId: s.itemId, qty: String(s.quantity) })));
  }
  const commit = (next: { itemId: string; qty: string }[]) => {
    setRows(next);
    const clean = next
      .filter((r) => r.itemId && Number(r.qty) > 0)
      .map((r) => ({ itemId: r.itemId, quantity: Number(r.qty) }));
    setSeen(clean);
    onChange(clean);
  };
  if (!stock.length) return null;
  const item = (id: string) => stock.find((i) => i.id === id);
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-fg">Other things used{over}</h2>
        <p className="text-sm text-fg-muted">
          Drugs, disinfectant, litter, fuel: each comes off stock, charged to this batch.
        </p>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-start gap-2">
          <Select
            aria-label={`Thing used ${i + 1}`}
            value={r.itemId}
            onChange={(e) => commit(rows.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
          >
            <option value="">Choose from stock</option>
            {stock.map((s) => (
              <option key={s.id} value={s.id} disabled={rows.some((x, j) => j !== i && x.itemId === s.id)}>
                {s.name}
              </option>
            ))}
          </Select>
          <label className="block">
            <span className="sr-only">How much of thing {i + 1}</span>
            <Input
              inputMode="decimal"
              className="num"
              placeholder="0"
              value={r.qty}
              onChange={(e) =>
                commit(
                  rows.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/[^\d.]/g, "").slice(0, 9) } : x)),
                )
              }
            />
            {item(r.itemId) && (
              <span className="mt-1 block text-xs text-fg-subtle">
                {item(r.itemId)!.unit}s · {quantity(item(r.itemId)!.onHand, item(r.itemId)!.unit as Unit)} left
              </span>
            )}
          </label>
          <button
            type="button"
            aria-label={`Remove thing used ${i + 1}`}
            onClick={() => commit(rows.filter((_, j) => j !== i))}
            className="focus-ring grid size-11 place-items-center rounded-lg text-fg-subtle hover:bg-surface-subtle hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
      {error && <p className="text-[13px] font-medium text-danger-fg">{error}</p>}
      {rows.length < stock.length && (
        <button
          type="button"
          onClick={() => setRows([...rows, { itemId: "", qty: "" }])}
          className="focus-ring inline-flex items-center gap-2 rounded text-sm font-semibold text-brand-fg"
        >
          <Plus className="size-4" aria-hidden /> Add something used
        </button>
      )}
    </section>
  );
}
