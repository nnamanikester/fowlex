"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  Clock,
  FileText,
  History,
  Pencil,
  Phone,
} from "lucide-react";

import { ContractSheet, STATUS_TONE } from "../../_components/contract-sheet";
import { DeliveryChart } from "@/components/charts";
import { Panel } from "@/components/kit";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/auth/client";
import type { ContractDashboard } from "@/lib/contracts/dashboard";
import type { Side } from "@/lib/contracts/fulfilment";
import { DELIVERY_LABELS, PER_UNIT, STATUS_LABELS } from "@/lib/contracts/rules";
import type { ChangeTerms, ChangeView, ContractView, TemplateView } from "@/lib/contracts/service";
import { formatRange } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/sales/rules";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

const day = (d: string) => formatRange({ from: d, to: d });
const short = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`),
  );
const month = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`),
  );
const birds = (n: number) => `${n.toLocaleString("en-NG")} bird${n === 1 ? "" : "s"}`;
/** Whole naira when there are no kobo. */
const naira = (kobo: number) => (kobo % 100 ? formatNaira(kobo) : formatNaira(kobo).replace(/\.00$/, ""));

/** A term as a person would say it: "₦7,000 a bird", "200 birds a week", "14 days". */
function termText(key: keyof ChangeTerms, t: ChangeTerms, c: ContractView): string {
  const v = t[key];
  if (v === null || v === undefined || v === "") return "none";
  switch (key) {
    case "priceKobo":
      return `${naira(v as number)} ${PER_UNIT[t.pricing ?? c.pricing]}`;
    case "pricing":
      return v === "perKg" ? "per kg" : "per bird";
    case "minBirds":
      return `${birds(v as number)} a ${t.minPer ?? c.minPer}`;
    case "minPer":
      return `a ${String(v)}`;
    case "deliveryEvery":
      return DELIVERY_LABELS[v as ContractView["deliveryEvery"]].toLowerCase();
    case "termsDays":
      return `${String(v)} days to pay`;
    case "startDate":
    case "endDate":
    case "reviewOn":
      return day(v as string);
    case "document":
      return (v as { name?: string }).name || "a signed copy";
    default:
      return String(v);
  }
}
const TERM_NAMES: Record<keyof ChangeTerms, string> = {
  pricing: "Priced",
  priceKobo: "Price",
  minBirds: "Minimum",
  minPer: "Minimum per",
  deliveryEvery: "Deliveries",
  termsDays: "Payment",
  startDate: "Starts",
  endDate: "Ends",
  reviewOn: "Price review",
  notes: "Notes",
  document: "Signed copy",
};

/**
 * A contract's own page: who is keeping to it (the farm and the customer, each in a sentence),
 * the numbers behind that (delivered against promised, what's left, where it's heading, what's
 * owed), the deliveries week by week, the agreement laid out as signed, and every change to it.
 */
export function ContractDashboardView({
  data,
  templates,
  today,
  canWrite,
  canApprove,
  seesSales,
  seesInvoices,
}: {
  data: ContractDashboard;
  templates: TemplateView[];
  today: string;
  canWrite: boolean;
  canApprove: boolean;
  seesSales: boolean;
  seesInvoices: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const { contract: c, fulfilment: f, customer } = data;
  const editable = canWrite && (c.status === "active" || c.status === "draft");
  const unit = c.minPer === "month" ? "month" : "week";
  const periodLabel = (start: string, i: number) => (c.minPer === "month" ? month(start) : `Wk ${i + 1}`);
  const chart = f.periods.map((p, i) => ({
    label: periodLabel(p.start, i),
    ordered: p.ordered,
    delivered: p.delivered,
  }));
  const progress = f.daysTotal ? Math.round((f.daysIn / f.daysTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link
        href="/contracts"
        className="focus-ring inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-fg hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden /> Contracts
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fg-heading [overflow-wrap:anywhere]">
            {customer.name}
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-fg-muted">
            <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABELS[c.status]}</Badge>
            <span className="font-mono">{c.number}</span>
            <span className="num">
              {day(c.startDate)} to {day(c.terminatedOn ?? c.endDate)}
            </span>
          </p>
        </div>
        {editable && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil /> {c.status === "draft" ? "Edit draft" : "Change terms"}
          </Button>
        )}
      </header>

      {c.pendingChange && (
        <PendingChange change={c.pendingChange} contract={c} canApprove={canApprove} onDone={() => router.refresh()} />
      )}

      {/* The answer first: is each side keeping to it? */}
      <section aria-label="Who is keeping to it" className="grid items-start gap-4 md:grid-cols-2">
        <SideCard who="Our side" note={`What ${data.farm.name || "the farm"} delivers`} side={f.farm} />
        <SideCard who="Their side" note={`What ${customer.name} orders and pays`} side={f.customer} />
      </section>

      <section aria-label="The numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Delivered so far"
          value={birds(f.deliveredToDate)}
          detail={
            f.promisedToDate !== null
              ? `of ${birds(f.promisedToDate)} promised in the ${unit}s that are over`
              : `of ${birds(f.orderedToDate)} ordered`
          }
          bar={f.rate}
          tone={f.rate === null ? "neutral" : f.rate >= 95 ? "good" : f.rate >= 80 ? "watch" : "bad"}
        />
        <Kpi
          label="Still to deliver"
          value={f.promisedLeft !== null ? birds(f.promisedLeft) : birds(f.bookedAhead)}
          detail={
            f.promisedLeft !== null
              ? `${birds(f.bookedAhead)} already ordered ahead`
              : "on orders still to deliver; no minimum agreed"
          }
        />
        <Kpi
          label="Heading for"
          value={birds(f.projectedTotal)}
          detail={
            f.promisedTotal !== null
              ? `by the end, at the recent pace, against ${birds(f.promisedTotal)} promised`
              : "by the end, at the recent pace"
          }
          tone={f.promisedTotal === null ? "neutral" : f.projectedTotal >= f.promisedTotal ? "good" : "watch"}
        />
        <Kpi
          label="Owed now"
          value={naira(f.outstandingKobo)}
          detail={f.overdueKobo ? `${naira(f.overdueKobo)} of it past due` : "Nothing past due"}
          tone={f.overdueKobo ? "bad" : "good"}
        />
      </section>

      <Panel
        title={`Deliveries, ${unit} by ${unit}`}
        description={`${f.phase === "upcoming" ? "Starts" : f.phase === "ended" ? "Ran" : "Running"} ${f.daysIn} of ${f.daysTotal} days (${progress}%). ${
          c.minBirds ? `The agreed minimum is ${birds(c.minBirds)} a ${unit}.` : "No minimum was agreed."
        }`}
      >
        <DeliveryChart title={`Birds ordered and delivered each ${unit}`} data={chart} minimum={c.minBirds} />
        <PeriodTable periods={f.periods} label={periodLabel} unit={unit} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Agreement data={data} />
        <div className="space-y-6">
          <Panel title="Money" description={`What this contract has billed, and how ${customer.name} pays.`}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
              <Figure label="Delivered worth" value={naira(f.valueDeliveredKobo)} />
              <Figure label="Billed" value={naira(f.billedKobo)} />
              <Figure label="Paid" value={naira(f.paidKobo)} />
              <Figure label="Owed" value={naira(f.outstandingKobo)} warn={f.overdueKobo > 0} />
              <Figure
                label="Pays in"
                value={f.avgDaysToPay === null ? "Not yet known" : `${f.avgDaysToPay} days on average`}
                warn={f.avgDaysToPay !== null && f.avgDaysToPay > c.termsDays}
              />
              <Figure label="Agreed" value={`${c.termsDays} days`} />
            </dl>
            {f.overdueInvoices.length > 0 && (
              <div className="mt-5 space-y-2 border-t border-line pt-4">
                <p className="text-sm font-semibold text-danger-fg">Past due</p>
                <ul className="space-y-2">
                  {f.overdueInvoices.map((i) => (
                    <li key={i.number} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="font-mono">{i.number}</span>{" "}
                        <span className="text-fg-muted">
                          {i.daysLate} day{i.daysLate === 1 ? "" : "s"} late
                        </span>
                      </span>
                      <span className="num shrink-0 font-semibold text-fg">{naira(i.owedKobo)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-brand-fg hover:underline"
              >
                <Phone className="size-4" aria-hidden /> Call {customer.contactName || customer.name}
              </a>
            )}
          </Panel>
          <History_ changes={data.changes} contract={c} />
        </div>
      </div>

      {seesSales && (
        <Panel title="Orders on this contract" description="Every order priced by it, oldest first." flush>
          {data.orders.length ? (
            <ul className="divide-y divide-line">
              {data.orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/sales?open=${o.id}`}
                    className="focus-ring flex items-center gap-3 px-5 py-3.5 hover:bg-surface-subtle"
                  >
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block font-semibold text-fg">{birds(o.birds)}</span>
                      <span className="num block text-xs text-fg-muted">
                        {o.number} · {day(o.deliveryDate)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="num font-semibold text-fg">{naira(o.totalKobo)}</span>
                      <Badge
                        tone={o.status === "pending" ? "warning" : o.status === "cancelled" ? "neutral" : "success"}
                      >
                        {ORDER_STATUS_LABELS[o.status as OrderStatus]}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-fg-muted">
              No orders on it yet. Orders for {customer.name} on its days use its price.
            </p>
          )}
        </Panel>
      )}
      {seesInvoices && data.invoices.length > 0 && (
        <Panel title="Invoices" description="The bills for its orders." flush>
          <ul className="divide-y divide-line">
            {data.invoices.map((i) => {
              const paid = i.paidKobo >= i.totalKobo;
              const late = !paid && i.dueDate < today;
              return (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block font-mono font-semibold text-fg">{i.number}</span>
                    <span className="num block text-xs text-fg-muted">
                      Issued {day(i.issueDate)} · due {day(i.dueDate)}
                      {i.paidOn ? ` · paid ${day(i.paidOn)}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="num font-semibold text-fg">
                      {naira(paid ? i.totalKobo : i.totalKobo - i.paidKobo)}
                    </span>
                    <Badge tone={paid ? "success" : late ? "danger" : "info"}>
                      {paid ? "Paid" : late ? "Past due" : "To pay"}
                    </Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {editing && (
        <ContractSheet
          contract={c}
          customers={[{ id: customer.id, name: customer.name, termsDays: c.termsDays }]}
          templates={templates}
          today={today}
          canWrite={canWrite}
          canApprove={canApprove}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false);
            toast.success(message);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const SIDE = {
  keeping: { icon: CircleCheck, ring: "border-success-line bg-success-subtle", ink: "text-success-fg" },
  behind: { icon: CircleAlert, ring: "border-danger-line bg-danger-subtle", ink: "text-danger-fg" },
  not_yet: { icon: Clock, ring: "border-line bg-surface", ink: "text-fg-muted" },
} as const;

/** One side of the deal, answered: keeping to it, falling short (and how), or too early to say. */
function SideCard({ who, note, side }: { who: string; note: string; side: Side }) {
  const s = SIDE[side.state];
  return (
    <div className={cn("space-y-3 rounded-2xl border p-5 sm:p-6", s.ring)}>
      <div className="flex items-start gap-3">
        <s.icon className={cn("mt-0.5 size-7 shrink-0", s.ink)} aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-fg-muted">
            {who} <span className="font-normal">· {note}</span>
          </p>
          <p className="font-display text-2xl font-bold leading-tight text-fg-heading">{side.headline}</p>
        </div>
      </div>
      {side.reasons.length > 0 && (
        <ul className="space-y-1.5 pl-10 text-sm text-fg">
          {side.reasons.map((r) => (
            <li key={r} className="list-disc">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TONES = {
  neutral: "bg-brand",
  good: "bg-success",
  watch: "bg-warning",
  bad: "bg-danger",
} as const;

function Kpi({
  label,
  value,
  detail,
  bar,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  bar?: number | null;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface p-5 shadow-card">
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <span aria-hidden className={cn("size-2 rounded-full", TONES[tone])} />
        {label}
      </p>
      <p className="num text-2xl font-semibold leading-tight text-fg-heading [overflow-wrap:anywhere]">{value}</p>
      {bar !== undefined && bar !== null && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="meter"
          aria-label={`${label}: ${bar}%`}
          aria-valuenow={bar}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={cn("h-full rounded-full", TONES[tone])} style={{ width: `${bar}%` }} />
        </div>
      )}
      <p className="text-sm text-fg-muted">{detail}</p>
    </div>
  );
}

function Figure({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className={cn("num text-lg font-semibold", warn ? "text-danger-fg" : "text-fg-heading")}>{value}</dd>
    </div>
  );
}

/** Every period that has started: promised, ordered, delivered, and who fell short. */
function PeriodTable({
  periods,
  label,
  unit,
}: {
  periods: ContractDashboard["fulfilment"]["periods"];
  label: (start: string, i: number) => string;
  unit: string;
}) {
  const [all, setAll] = React.useState(false);
  const started = periods.map((p, i) => ({ ...p, i })).filter((p) => p.state !== "future");
  if (!started.length) return null;
  const shown = all ? started : started.slice(-6);
  return (
    <div className="mt-6 space-y-3 border-t border-line pt-5">
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Each {unit} so far</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="py-2.5 pr-3 font-semibold">
                {unit === "month" ? "Month" : "Week"}
              </th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                Promised
              </th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                Ordered
              </th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                Delivered
              </th>
              <th scope="col" className="py-2.5 font-semibold">
                How it went
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((p) => (
              <tr key={p.start}>
                <td className="py-3 pr-3">
                  <span className="block font-semibold text-fg">{label(p.start, p.i)}</span>
                  <span className="num block text-xs text-fg-muted">
                    {short(p.start)} to {short(p.end)}
                  </span>
                </td>
                <td className="num py-3 pr-3 text-right text-fg">{p.promised ?? "None"}</td>
                <td className="num py-3 pr-3 text-right text-fg">{p.ordered}</td>
                <td className="num py-3 pr-3 text-right font-semibold text-fg-heading">{p.delivered}</td>
                <td className="py-3">
                  {p.state === "current" ? (
                    <Badge tone="info">Running now</Badge>
                  ) : p.farmShort ? (
                    <Badge tone="danger">We were {p.farmShort} short</Badge>
                  ) : p.customerShort ? (
                    <Badge tone="warning">They ordered {p.customerShort} under</Badge>
                  ) : (
                    <Badge tone="success">Kept</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {started.length > 6 && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="focus-ring rounded text-sm font-semibold text-brand-fg hover:underline"
        >
          {all ? "Show the last 6" : `Show all ${started.length} ${unit}s`}
        </button>
      )}
    </div>
  );
}

/** The agreement, laid out as it was signed: the parties, then each term as a numbered clause. */
function Agreement({ data }: { data: ContractDashboard }) {
  const { contract: c, farm, customer } = data;
  const clauses: [string, React.ReactNode][] = [
    [
      "Price",
      <>
        <strong className="num">{naira(c.priceKobo)}</strong> {PER_UNIT[c.pricing]}
        {c.pricing === "perKg" ? ", weighed on the day of delivery." : ", whatever each one weighs."}
      </>,
    ],
    [
      "Quantity",
      c.minBirds ? (
        <>
          At least <strong className="num">{birds(c.minBirds)}</strong> a {c.minPer}.
        </>
      ) : (
        "As many birds as the buyer orders; no minimum."
      ),
    ],
    ["Deliveries", `${DELIVERY_LABELS[c.deliveryEvery]}.`],
    [
      "Payment",
      <>
        Within <strong className="num">{c.termsDays} days</strong> of each invoice.
      </>,
    ],
    [
      "Term",
      <>
        From <strong>{day(c.startDate)}</strong> to <strong>{day(c.endDate)}</strong>
        {c.terminatedOn ? `, ended early on ${day(c.terminatedOn)}` : ""}.
      </>,
    ],
    ...(c.reviewOn ? [["Price review", `The price may be reviewed on ${day(c.reviewOn)}.`] as [string, string]] : []),
    ...(c.notes ? [["Also agreed", c.notes] as [string, string]] : []),
  ];
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="h-1.5 bg-[rgb(var(--comb))]" aria-hidden />
      <div className="space-y-8 p-6 sm:p-8">
        <header className="space-y-1.5 text-center">
          <p className="text-sm text-fg-muted">Supply agreement</p>
          <h2 className="font-display text-2xl font-bold text-fg-heading">Broilers for {customer.name}</h2>
          <p className="font-mono text-sm text-fg-muted">{c.number}</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <Party role="Seller" name={farm.name} lines={[farm.address, farm.phone, farm.email]} />
          <Party
            role="Buyer"
            name={customer.name}
            lines={[
              customer.contactName && `Attn: ${customer.contactName}`,
              customer.address,
              customer.phone,
              customer.email,
            ]}
          />
        </div>
        <ol className="space-y-5">
          {clauses.map(([title, body], i) => (
            <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
              <span className="num pt-0.5 text-sm font-semibold text-fg-muted">{i + 1}.</span>
              <div className="space-y-1">
                <h3 className="font-semibold text-fg-heading">{title}</h3>
                <p className="text-fg">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <footer className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
          {[farm.name, customer.name].map((who) => (
            <div key={who} className="space-y-2">
              <div className="h-10 border-b border-dashed border-line-strong" aria-hidden />
              <p className="text-sm text-fg-muted">For {who}</p>
            </div>
          ))}
          {c.document && (
            <a
              href={c.document.url}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-brand-fg hover:underline sm:col-span-2"
            >
              <FileText className="size-4" aria-hidden /> The signed copy{c.document.name ? `: ${c.document.name}` : ""}
            </a>
          )}
        </footer>
      </div>
    </article>
  );
}

function Party({ role, name, lines }: { role: string; name: string; lines: (string | false | undefined)[] }) {
  return (
    <div className="space-y-1.5 rounded-xl bg-surface-subtle p-4">
      <p className="text-sm text-fg-muted">{role}</p>
      <p className="font-semibold text-fg-heading">{name || "Not set"}</p>
      {lines.filter(Boolean).map((l) => (
        <p key={String(l)} className="text-sm text-fg [overflow-wrap:anywhere]">
          {l}
        </p>
      ))}
    </div>
  );
}

/** A change asked for and waiting: what would change, and (for owners) approve or turn it down. */
function PendingChange({
  change,
  contract,
  canApprove,
  onDone,
}: {
  change: ChangeView;
  contract: ContractView;
  canApprove: boolean;
  onDone: () => void;
}) {
  const action = useAction();
  const [declining, setDeclining] = React.useState(false);
  const [note, setNote] = React.useState("");
  const decide = (approve: boolean) =>
    void action.run(() => apiRequest(`/api/contracts/changes/${change.id}`, "POST", { approve, note }), {
      key: approve ? "approve" : "decline",
      success: approve ? "Approved: the contract has its new terms." : "Turned down: they've been told why.",
      onSuccess: onDone,
    });
  return (
    <section
      aria-label="A change waiting for approval"
      className="space-y-4 rounded-2xl border border-warning-line bg-warning-subtle p-5 sm:p-6"
    >
      <div className="space-y-1">
        <p className="font-semibold text-fg-heading">
          {change.requestedBy} asked to change {Object.keys(change.after).length === 1 ? "a term" : "these terms"}
        </p>
        <p className="text-sm text-fg-muted">
          {canApprove
            ? "Nothing changes until you approve it."
            : "Waiting for an owner. Until they approve it, the contract keeps its terms."}
          {change.reason && ` Their reason: “${change.reason}”`}
        </p>
      </div>
      <ChangeLines change={change} contract={contract} />
      {canApprove && (
        <div className="space-y-3">
          <ActionFeedback action={action} />
          {declining ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Why you&apos;re turning it down</span>
                <Input
                  value={note}
                  autoFocus
                  maxLength={500}
                  placeholder="Why, so they know what to change"
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <Button
                variant="secondary"
                loading={action.isPending("decline")}
                disabled={!note.trim()}
                reason="Say why first."
                onClick={() => decide(false)}
              >
                Turn it down
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button loading={action.isPending("approve")} disabled={action.busy} onClick={() => decide(true)}>
                <CircleCheck /> Approve the change
              </Button>
              <Button variant="ghost" disabled={action.busy} onClick={() => setDeclining(true)}>
                Turn it down
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ChangeLines({ change, contract }: { change: ChangeView; contract: ContractView }) {
  return (
    <ul className="space-y-2">
      {(Object.keys(change.after) as (keyof ChangeTerms)[]).map((k) => (
        <li key={k} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="w-24 shrink-0 font-semibold text-fg">{TERM_NAMES[k]}</span>
          <span className="num text-fg-muted line-through decoration-fg-subtle">
            {termText(k, change.before, contract)}
          </span>
          <ArrowRight className="size-4 text-fg-subtle" aria-label="becomes" />
          <span className="num font-semibold text-fg-heading">{termText(k, change.after, contract)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Every change to its terms, newest first: who asked, what changed, who decided. */
function History_({ changes, contract }: { changes: ChangeView[]; contract: ContractView }) {
  const decided = changes.filter((ch) => ch.status !== "pending");
  return (
    <Panel title="Changes to its terms" description="Every change, who asked and who approved it.">
      {decided.length ? (
        <ol className="space-y-5">
          {decided.map((ch) => (
            <li key={ch.id} className="space-y-2.5">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={ch.status === "approved" ? "success" : "neutral"}>
                  {ch.status === "approved" ? "Approved" : "Turned down"}
                </Badge>
                <span className="text-fg-muted">
                  {ch.requestedBy === ch.decidedBy
                    ? `Changed by ${ch.requestedBy}`
                    : `Asked by ${ch.requestedBy}, ${ch.status === "approved" ? "approved" : "turned down"} by ${ch.decidedBy}`}{" "}
                  on {day(ch.decidedAt!.slice(0, 10))}
                </span>
              </p>
              <ChangeLines change={ch} contract={contract} />
              {(ch.reason || ch.decisionNote) && (
                <p className="text-sm text-fg-muted">
                  {ch.reason && `Why: ${ch.reason}. `}
                  {ch.decisionNote && `Answer: ${ch.decisionNote}`}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <History className="size-4" aria-hidden /> No changes since it was agreed.
        </p>
      )}
    </Panel>
  );
}
