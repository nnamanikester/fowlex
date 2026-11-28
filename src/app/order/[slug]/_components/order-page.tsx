"use client";

import * as React from "react";
import { Check, Home, LoaderCircle, Minus, Phone, Plus, Truck } from "lucide-react";

import { apiRequest, asProblem, type AuthError } from "@/lib/auth/client";
import { formatNaira as formatKobo } from "@/lib/money";
import { type PriceOption, priceEstimate, priceLabel } from "@/lib/shop/prices";
import { dayLabel, type OnlineOrderInput, validateOnlineOrder } from "@/lib/shop/rules";
import type { Offer, Placed } from "@/lib/shop/service";
import { cn } from "@/lib/utils";

/** Naira as buyers write it: "₦3,200", with kobo only when there are any. */
const formatNaira = (kobo: number) => (kobo % 100 ? formatKobo(kobo) : formatKobo(kobo).replace(/\.00$/, ""));
const QUICK = [10, 25, 50, 100, 200, 500];
const KEEP = "fowlex.order.details";
const kg = (grams: number) => `${(Math.round(grams / 100) / 10).toLocaleString("en-NG")} kg`;
const birdsText = (n: number) => `${n.toLocaleString("en-NG")} bird${n === 1 ? "" : "s"}`;
const newId = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^\w-]/g, "");

type Details = Pick<OnlineOrderInput, "name" | "phone" | "email" | "business" | "address">;
const EMPTY: Details = { name: "", phone: "", email: "", business: "", address: "" };

/** Details from this phone's last order, so a returning customer types nothing. */
function remembered(): Details | null {
  try {
    const raw = window.localStorage.getItem(KEEP);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Details>) } : null;
  } catch {
    return null;
  }
}

/**
 * The public order page: the farm's supply on a board at the top, then one form in three plain
 * steps (how many, when, who you are) with the total and the one button always in reach.
 */
export function OrderPage({ offer, today }: { offer: Offer; today: string }) {
  const firstDay = offer.days[0]?.date ?? today;
  const [birds, setBirds] = React.useState(Math.min(50, offer.days[0]?.birds ?? 0) || 0);
  const [date, setDate] = React.useState(firstDay);
  const [delivery, setDelivery] = React.useState(false);
  const [priceId, setPriceId] = React.useState(offer.prices[0]?.id ?? "");
  const [details, setDetails] = React.useState<Details>(EMPTY);
  const [returning, setReturning] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [allDays, setAllDays] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const [placed, setPlaced] = React.useState<Placed | null>(null);
  const requestId = React.useRef(newId());
  const trap = React.useRef<HTMLInputElement>(null);

  // On a phone the order bar is pinned to the bottom: whatever is scrolled to (the next field, an
  // error) stops above it, not under it.
  React.useEffect(() => {
    const html = document.documentElement;
    html.style.scrollPaddingBottom = "10rem";
    return () => {
      html.style.scrollPaddingBottom = "";
    };
  }, []);

  // A returning customer's details, from this phone. Read after the page has drawn.
  React.useEffect(() => {
    const saved = remembered();
    if (saved?.name) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable in the browser
      setDetails(saved);
      setReturning(true);
    }
  }, []);

  const day = offer.days.find((d) => d.date === date) ?? offer.days[0];
  const max = day?.birds ?? 0;
  const values: OnlineOrderInput = { birds, date, delivery, ...details, notes };
  const errors = validateOnlineOrder(values, { delivers: offer.delivers });
  if (birds > max)
    errors.birds = `We have ${birdsText(max)} for ${dayLabel(date, today).toLowerCase() === "today" ? "today" : "that day"}.`;
  const show = (f: keyof OnlineOrderInput) =>
    failure?.field === f ? failure.message : submitted ? errors[f] : undefined;
  const option = offer.prices.find((p) => p.id === priceId) ?? offer.prices[0];
  const total = priceEstimate(option, birds, offer.weightGrams);
  const exact = option.pricing === "perBird";
  const set = (k: keyof Details, v: string) => setDetails((d) => ({ ...d, [k]: v }));

  const place = async () => {
    setSubmitted(true);
    setFailure(null);
    const first = (["birds", "date", "delivery", "address", "name", "phone", "email", "business"] as const).find(
      (f) => errors[f],
    );
    if (first) {
      document.getElementById(`order-${first}`)?.focus();
      document.getElementById(`order-${first}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    setSending(true);
    try {
      const done = await apiRequest<Placed>(`/api/public/shop/${offer.slug}/orders`, "POST", {
        ...values,
        priceId: option.id,
        requestId: requestId.current,
        website: trap.current?.value ?? "",
      });
      try {
        window.localStorage.setItem(KEEP, JSON.stringify(details));
      } catch {
        // Private browsing: they'll type it again next time.
      }
      setPlaced(done);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      const problem = asProblem(e);
      setFailure(problem);
      if (problem.field)
        document.getElementById(`order-${problem.field}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    } finally {
      setSending(false);
    }
  };

  if (placed)
    return (
      <Confirmation
        placed={placed}
        today={today}
        onAgain={() => {
          requestId.current = newId();
          setPlaced(null);
          setSubmitted(false);
          setNotes("");
          setReturning(true);
        }}
      />
    );

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <Board offer={offer} today={today} />

      {offer.days.length === 0 ? (
        <section className="mx-auto max-w-xl px-4 py-12 text-center">
          <h2 className="font-display text-2xl font-bold text-fg-heading">Everything is spoken for right now</h2>
          <p className="mt-2 text-fg-muted">New birds are on the way. Call us and we&apos;ll keep some for you.</p>
          {offer.farm.phone && <CallButton phone={offer.farm.phone} name={offer.farm.name} className="mt-6" />}
        </section>
      ) : (
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-8 px-4 pb-40 pt-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:pb-16 lg:pt-12">
          <form
            noValidate
            className="min-w-0 space-y-10"
            onSubmit={(e) => {
              e.preventDefault();
              void place();
            }}
          >
            <Step n={1} title="How many birds?">
              <div className="flex items-center gap-3">
                <RoundButton
                  label="One bird fewer"
                  disabled={birds <= 1}
                  onClick={() => setBirds((b) => Math.max(1, b - (b > 20 ? 5 : 1)))}
                >
                  <Minus />
                </RoundButton>
                <label className="block min-w-0 flex-1 text-center">
                  <span className="sr-only">Number of birds</span>
                  <input
                    id="order-birds"
                    size={1}
                    inputMode="numeric"
                    aria-invalid={show("birds") ? true : undefined}
                    aria-describedby="order-birds-note"
                    value={birds ? String(birds) : ""}
                    placeholder="0"
                    onChange={(e) => setBirds(Number(e.target.value.replace(/\D/g, "").slice(0, 6)) || 0)}
                    className="num w-full bg-transparent text-center font-display text-6xl font-bold tracking-tight text-fg-heading outline-none placeholder:text-fg-subtle focus-visible:underline focus-visible:decoration-comb focus-visible:decoration-4 focus-visible:underline-offset-8 sm:text-7xl"
                  />
                </label>
                <RoundButton
                  label="One bird more"
                  disabled={birds >= max}
                  onClick={() => setBirds((b) => Math.min(max, b + (b >= 20 ? 5 : 1)))}
                >
                  <Plus />
                </RoundButton>
              </div>
              <div role="group" aria-label="Quick amounts" className="mt-4 flex flex-wrap justify-center gap-2">
                {QUICK.filter((q) => q <= max).map((q) => (
                  <Chip key={q} pressed={birds === q} onClick={() => setBirds(q)}>
                    {q}
                  </Chip>
                ))}
                {max > 0 && !QUICK.includes(max) && max < 2000 && (
                  <Chip pressed={birds === max} onClick={() => setBirds(max)}>
                    All {max.toLocaleString("en-NG")}
                  </Chip>
                )}
              </div>
              <p
                id="order-birds-note"
                className={cn(
                  "mt-3 text-center text-sm",
                  show("birds") ? "font-medium text-danger-fg" : "text-fg-muted",
                )}
              >
                {show("birds") ??
                  (birds
                    ? `About ${kg(birds * offer.weightGrams)} of chicken, ${exact ? "" : "about "}${formatNaira(total)}`
                    : "Tap a number, or type it")}
              </p>
              {offer.prices.length > 1 && (
                <>
                  <p id="which-birds" className="mt-6 text-sm font-semibold text-fg-heading">
                    Which birds?
                  </p>
                  <div
                    role="radiogroup"
                    aria-labelledby="which-birds"
                    id="order-priceId"
                    className="mt-2 grid gap-2 sm:grid-cols-2"
                  >
                    {offer.prices.map((p) => (
                      <PriceChoice
                        key={p.id}
                        price={p}
                        weightGrams={offer.weightGrams}
                        checked={option.id === p.id}
                        onClick={() => setPriceId(p.id)}
                      />
                    ))}
                  </div>
                </>
              )}
            </Step>

            <Step n={2} title="When?">
              <div
                role="radiogroup"
                aria-label="Day"
                id="order-date"
                className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
              >
                {(allDays ? offer.days : offer.days.slice(0, 7)).map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    role="radio"
                    aria-checked={date === d.date}
                    onClick={() => {
                      setDate(d.date);
                      if (birds > d.birds) setBirds(d.birds);
                    }}
                    className={cn(
                      "focus-ring min-w-[7.5rem] shrink-0 snap-start rounded-2xl border px-4 py-3 text-left transition-colors",
                      date === d.date
                        ? "border-charcoal bg-charcoal text-white"
                        : "border-line bg-surface text-fg hover:border-line-strong",
                    )}
                  >
                    <span className="block font-display text-lg font-bold">{dayLabel(d.date, today)}</span>
                    <span className={cn("num block text-xs", date === d.date ? "text-white/70" : "text-fg-muted")}>
                      {d.birds.toLocaleString("en-NG")} ready
                    </span>
                  </button>
                ))}
              </div>
              {!allDays && offer.days.length > 7 && (
                <button
                  type="button"
                  onClick={() => setAllDays(true)}
                  className="focus-ring mt-2 rounded text-sm font-semibold text-brand-fg"
                >
                  Later days
                </button>
              )}
              <div
                role="radiogroup"
                aria-label="Collect or deliver"
                id="order-delivery"
                className="mt-4 grid grid-cols-2 gap-2"
              >
                <Choice
                  checked={!delivery}
                  onClick={() => setDelivery(false)}
                  icon={<Home />}
                  title="I'll collect"
                  detail="From the farm"
                />
                {offer.delivers ? (
                  <Choice
                    checked={delivery}
                    onClick={() => setDelivery(true)}
                    icon={<Truck />}
                    title="Deliver to me"
                    detail="We'll confirm the cost"
                  />
                ) : (
                  <p className="flex items-center rounded-2xl border border-dashed border-line px-4 text-sm text-fg-muted">
                    We don&apos;t deliver yet
                  </p>
                )}
              </div>
              {delivery && (
                <TextField
                  id="order-address"
                  label="Where should we deliver?"
                  value={details.address}
                  onChange={(v) => set("address", v)}
                  error={show("address")}
                  multiline
                  autoComplete="street-address"
                  placeholder="12 Allen Avenue, Ikeja"
                />
              )}
            </Step>

            <Step n={3} title="Your details">
              {returning && details.name && (
                <p className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface px-4 py-3 text-sm text-fg">
                  <span>
                    Welcome back, <strong>{details.name.split(" ")[0]}</strong>. Your details are filled in.
                  </span>
                  <button
                    type="button"
                    className="focus-ring rounded font-semibold text-brand-fg"
                    onClick={() => {
                      setDetails(EMPTY);
                      setReturning(false);
                      try {
                        window.localStorage.removeItem(KEEP);
                      } catch {
                        // Nothing kept.
                      }
                    }}
                  >
                    Not you?
                  </button>
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="order-name"
                  label="Your name"
                  value={details.name}
                  onChange={(v) => set("name", v)}
                  error={show("name")}
                  autoComplete="name"
                />
                <TextField
                  id="order-phone"
                  label="Phone number"
                  hint="We call to confirm"
                  value={details.phone}
                  onChange={(v) => set("phone", v)}
                  error={show("phone")}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0803 123 4567"
                />
                <TextField
                  id="order-business"
                  label="Business name"
                  hint="If you're buying for a restaurant, lounge or hotel"
                  value={details.business}
                  onChange={(v) => set("business", v)}
                  error={show("business")}
                  autoComplete="organization"
                />
                <TextField
                  id="order-email"
                  label="Email"
                  hint="For your receipt"
                  value={details.email}
                  onChange={(v) => set("email", v)}
                  error={show("email")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                />
              </div>
              {noteOpen ? (
                <TextField
                  id="order-notes"
                  label="Anything else?"
                  value={notes}
                  onChange={setNotes}
                  error={show("notes")}
                  multiline
                  placeholder="Please call before you come"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setNoteOpen(true)}
                  className="focus-ring rounded text-sm font-semibold text-brand-fg"
                >
                  Add a note for the farm
                </button>
              )}
              {/* Never shown: only scripts fill it in. */}
              <input
                ref={trap}
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
              />
            </Step>

            <Summary
              className="lg:hidden"
              birds={birds}
              day={date ? dayLabel(date, today) : ""}
              delivery={delivery}
              total={total}
              exact={exact}
              sending={sending}
              failure={failure && !failure.field ? failure.message : null}
              floating
            />
          </form>

          <aside className="hidden lg:block">
            <div className="sticky top-6">
              <Summary
                birds={birds}
                day={date ? dayLabel(date, today) : ""}
                delivery={delivery}
                total={total}
                exact={exact}
                sending={sending}
                failure={failure && !failure.field ? failure.message : null}
                onPlace={() => void place()}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/** The supply board: what's ready, how heavy and what it costs, in the farm's own colours. */
function Board({ offer, today }: { offer: Offer; today: string }) {
  const next = offer.days.find((d) => d.birds > offer.readyNow);
  const [only] = offer.prices.length === 1 ? offer.prices : [];
  const cheapest = Math.min(...offer.prices.map((p) => priceEstimate(p, 1, offer.weightGrams)));
  const orderable = offer.days[offer.days.length - 1]?.birds ?? 0;
  return (
    <header className="bg-charcoal text-white">
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6 sm:pb-14">
        <div className="flex items-center justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- an SVG logo, already the right size */}
          <img src="/brand/fowlex-logo-horizontal-reverse.svg" alt={offer.farm.name} className="h-7 w-auto" />
          {offer.farm.phone && (
            <a
              href={`tel:${offer.farm.phone.replace(/\s/g, "")}`}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-white/80 hover:text-white"
            >
              <Phone className="size-4" aria-hidden /> {offer.farm.phone}
            </a>
          )}
        </div>
        <h1 className="mt-10 max-w-2xl font-display text-[clamp(2.25rem,8vw,4.25rem)] font-bold leading-[1.02] tracking-tight">
          {offer.readyNow > 0 ? (
            <>
              <span className="num text-[rgb(var(--comb-on-dark))]">{offer.readyNow.toLocaleString("en-NG")}</span>{" "}
              broilers ready today
            </>
          ) : offer.days[0] ? (
            <>
              Broilers ready from{" "}
              {dayLabel(offer.days[0].date, today).toLowerCase() === "tomorrow"
                ? "tomorrow"
                : dayLabel(offer.days[0].date, today)}
            </>
          ) : (
            "Fresh broilers, straight from the farm"
          )}
        </h1>
        <p className="mt-3 max-w-xl text-lg text-white/70">
          From {offer.farm.name}. Order here in a minute; we call you to confirm.
        </p>
        <dl className="mt-8 grid max-w-2xl grid-cols-3 border-t border-white/15">
          {[
            ["Each bird", `about ${kg(offer.weightGrams)}`],
            only ? ["Price", priceLabel(only)] : ["Prices", `from ${formatNaira(cheapest)} a bird`],
            only?.pricing === "perKg"
              ? ["A bird comes to", `about ${formatNaira(cheapest)}`]
              : ["To order", `${orderable.toLocaleString("en-NG")} birds`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 border-r border-white/15 py-4 pr-3 last:border-r-0 [&:not(:first-child)]:pl-3 sm:pr-5 [&:not(:first-child)]:sm:pl-5"
            >
              <dt className="text-xs text-white/60 sm:text-sm">{label}</dt>
              <dd className="num mt-1 font-display text-base font-bold [overflow-wrap:anywhere] sm:text-xl">{value}</dd>
            </div>
          ))}
        </dl>
        {next && offer.readyNow > 0 && (
          <p className="mt-3 text-sm text-white/60">
            {(next.birds - offer.readyNow).toLocaleString("en-NG")} more from {dayLabel(next.date, today)}.
          </p>
        )}
      </div>
    </header>
  );
}

/** One step of the order: a real sequence, so it's numbered. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="space-y-4">
      <h2
        id={`step-${n}`}
        className="flex items-center gap-3 font-display text-xl font-bold text-fg-heading sm:text-2xl"
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-charcoal text-sm text-white"
        >
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function RoundButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="focus-ring grid size-14 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-fg transition active:scale-95 disabled:opacity-40 [&_svg]:size-6"
    >
      {children}
    </button>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "focus-ring num min-h-11 min-w-12 rounded-full border px-4 text-sm font-semibold transition-colors",
        pressed ? "border-charcoal bg-charcoal text-white" : "border-line bg-surface text-fg hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

/** One of the farm's prices, as a card to choose: its name, the price and what a bird comes to. */
function PriceChoice({
  price,
  weightGrams,
  checked,
  onClick,
}: {
  price: PriceOption;
  weightGrams: number;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "focus-ring flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors",
        checked ? "border-charcoal bg-charcoal text-white" : "border-line bg-surface text-fg hover:border-line-strong",
      )}
    >
      <span className="min-w-0 space-y-0.5">
        <span className="block font-semibold">{price.name}</span>
        <span className={cn("num block text-xs", checked ? "text-white/70" : "text-fg-muted")}>
          {price.pricing === "perKg"
            ? `About ${formatNaira(priceEstimate(price, 1, weightGrams))} a bird, weighed on the day`
            : "A set price for each bird"}
        </span>
      </span>
      <span className="num shrink-0 font-display text-lg font-bold">{priceLabel(price)}</span>
    </button>
  );
}

function Choice({
  checked,
  onClick,
  icon,
  title,
  detail,
}: {
  checked: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "focus-ring flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors [&_svg]:size-5",
        checked ? "border-charcoal bg-charcoal text-white" : "border-line bg-surface text-fg hover:border-line-strong",
      )}
    >
      {icon}
      <span className="min-w-0 space-y-0.5">
        <span className="block font-semibold">{title}</span>
        <span className={cn("block text-xs", checked ? "text-white/70" : "text-fg-muted")}>{detail}</span>
      </span>
    </button>
  );
}

function TextField({
  id,
  label,
  hint,
  value,
  onChange,
  error,
  multiline,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  multiline?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id">) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const className = cn(
    "w-full rounded-2xl border bg-surface px-4 py-3 text-[16px] text-fg outline-none transition placeholder:text-fg-subtle focus:border-charcoal focus:ring-2 focus:ring-charcoal/15",
    error ? "border-danger" : "border-line",
  );
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-fg">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          placeholder={rest.placeholder}
          autoComplete={rest.autoComplete}
          className={className}
        />
      ) : (
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={className}
          {...rest}
        />
      )}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] font-medium text-danger-fg">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-[13px] text-fg-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** The order so far and the one button: pinned to the bottom on a phone, beside the form on a computer. */
function Summary({
  birds,
  day,
  delivery,
  total,
  exact,
  sending,
  failure,
  floating,
  onPlace,
  className,
}: {
  birds: number;
  day: string;
  delivery: boolean;
  total: number;
  /** Priced per bird: the total is what they pay, not an estimate. */
  exact: boolean;
  sending: boolean;
  failure: string | null;
  floating?: boolean;
  onPlace?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        floating
          ? "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md"
          : "rounded-3xl border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      <div className={cn(floating && "mx-auto max-w-xl")}>
        {failure && (
          <p role="alert" className="mb-2 text-sm font-medium text-danger-fg">
            {failure}
          </p>
        )}
        <div className={cn(floating ? "flex items-center gap-3" : "space-y-4")}>
          <div className="min-w-0 flex-1" aria-live="polite">
            {!floating && <p className="text-sm text-fg-muted">Your order</p>}
            <p className="num truncate font-display text-lg font-bold text-fg-heading">
              {birds ? birdsText(birds) : "Choose your birds"}
              {birds && day
                ? `, ${day.toLowerCase() === "today" || day.toLowerCase() === "tomorrow" ? day.toLowerCase() : day}`
                : ""}
            </p>
            <p className="num text-sm text-fg-muted">
              {birds ? (exact ? formatNaira(total) : `About ${formatNaira(total)}`) : " "}
              {!floating && birds ? (delivery ? ", delivered" : ", collected") : ""}
            </p>
          </div>
          <button
            type={onPlace ? "button" : "submit"}
            onClick={onPlace}
            disabled={sending}
            aria-busy={sending || undefined}
            className={cn(
              "focus-ring relative inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-comb px-6 text-base font-bold text-white shadow-button transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-80",
              !floating && "w-full",
            )}
          >
            {sending ? (
              <LoaderCircle className="size-5 animate-spin" aria-hidden />
            ) : (
              <Check className="size-5" aria-hidden />
            )}
            {sending ? "Placing…" : "Place order"}
          </button>
        </div>
        {!floating && (
          <p className="mt-3 text-xs text-fg-muted">
            You pay when the birds are weighed and handed over. Nothing to pay now.
          </p>
        )}
      </div>
    </div>
  );
}

function CallButton({ phone, name, className }: { phone: string; name: string; className?: string }) {
  return (
    <a
      href={`tel:${phone.replace(/\s/g, "")}`}
      className={cn(
        "focus-ring inline-flex min-h-12 items-center gap-2 rounded-2xl border border-line-strong bg-surface px-5 font-semibold text-fg",
        className,
      )}
    >
      <Phone className="size-4" aria-hidden /> Call {name}
    </a>
  );
}

/** The order is in: what was ordered, what happens next, and a call button. */
function Confirmation({ placed, today, onAgain }: { placed: Placed; today: string; onAgain: () => void }) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => heading.current?.focus(), []);
  const phone = /^\+234\d{10}$/.test(placed.phone)
    ? `0${placed.phone.slice(4, 7)} ${placed.phone.slice(7, 10)} ${placed.phone.slice(10)}`
    : placed.phone;
  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="bg-charcoal px-4 pb-14 pt-6 text-white">
        <div className="mx-auto max-w-xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- an SVG logo, already the right size */}
          <img src="/brand/fowlex-logo-horizontal-reverse.svg" alt={placed.farm.name} className="h-7 w-auto" />
          <span aria-hidden className="mt-10 grid size-16 animate-pop-in place-items-center rounded-full bg-comb">
            <Check className="size-8" />
          </span>
          <h1
            ref={heading}
            tabIndex={-1}
            className="mt-6 font-display text-4xl font-bold tracking-tight outline-none sm:text-5xl"
          >
            Order placed
          </h1>
          <p className="mt-2 text-lg text-white/70">
            Thank you, {placed.name.split(" ")[0]}. We&apos;ll call you on{" "}
            <span className="num whitespace-nowrap">{phone}</span> to confirm.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
        <dl className="divide-y divide-line rounded-3xl border border-line bg-surface">
          {[
            ["Order", placed.number],
            ["Birds", birdsText(placed.birds)],
            ["Day", dayLabel(placed.date, today)],
            ["How", placed.delivery ? "We deliver to you" : "You collect from the farm"],
            [placed.exact ? "Comes to" : "About", formatNaira(placed.estimateKobo)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-5 py-3.5">
              <dt className="text-fg-muted">{label}</dt>
              <dd className="num text-right font-semibold text-fg">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-fg-muted">
          The final amount is worked out when your birds are weighed. You pay then, not now.
          {placed.email && ` A copy is on its way to ${placed.email}.`}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          {placed.farm.phone && (
            <CallButton phone={placed.farm.phone} name={placed.farm.name} className="justify-center" />
          )}
          <button
            type="button"
            onClick={onAgain}
            className="focus-ring inline-flex min-h-12 items-center justify-center rounded-2xl px-5 font-semibold text-brand-fg"
          >
            Order more birds
          </button>
        </div>
      </main>
    </div>
  );
}
