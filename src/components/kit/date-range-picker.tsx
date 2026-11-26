"use client";

import * as React from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover } from "@/components/ui/popover";
import { type DateRange, formatRange, isISODate, matchPreset, PRESETS, presetRange, type PresetId } from "@/lib/dates";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";

/**
 * A date range for reports and lists: preset rows (today, last 7 or 30 days, this or last month,
 * this year) with a check on the current one, and a custom range in the footer. Dates are Lagos
 * calendar days, inclusive.
 */
export function DateRangePicker({
  value,
  onChange,
  label = "Date range",
  align = "start",
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const on = useToday();
  const preset = on ? matchPreset(value, on) : undefined;
  const id = React.useId();
  const shown = preset ? PRESETS.find((p) => p.id === preset)!.label : formatRange(value);

  const choose = (range: DateRange) => {
    onChange(range);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={label}
      align={align}
      className="w-[min(20rem,calc(100vw-1.5rem))] p-1.5"
      anchor={
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-label={`${label}: ${shown}`}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "focus-ring inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-fg shadow-button transition-colors hover:border-line-strong",
            open && "border-line-strong",
          )}
        >
          <CalendarDays className="size-4 text-fg-subtle" aria-hidden />
          {shown}
          {preset && <span className="hidden font-normal text-fg-subtle sm:inline">{formatRange(value)}</span>}
          <ChevronDown className="size-3.5 opacity-70" aria-hidden />
        </button>
      }
    >
      <div id={id}>
        <ul className="space-y-0.5">
          {PRESETS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => choose(presetRange(p.id, on ?? value.to))}
                aria-pressed={p.id === preset}
                className="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-fg hover:bg-surface-subtle"
              >
                <Check className={cn("size-4 shrink-0", p.id === preset ? "text-brand-fg" : "invisible")} aria-hidden />
                <span className="flex-1">{p.label}</span>
                <span className="text-xs text-fg-subtle">
                  {formatRange(presetRange(p.id as PresetId, on ?? value.to))}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <CustomRange key={`${value.from}:${value.to}`} value={value} max={on ?? undefined} onApply={choose} />
      </div>
    </Popover>
  );
}

/** Any two dates. Keyed by the current range, so it starts from it each time the range changes. */
function CustomRange({ value, max, onApply }: { value: DateRange; max?: string; onApply: (range: DateRange) => void }) {
  const [from, setFrom] = React.useState(value.from);
  const [to, setTo] = React.useState(value.to);
  const valid = isISODate(from) && isISODate(to) && from <= to;

  return (
    <form
      className="mt-1.5 grid gap-2 border-t border-line px-2.5 pb-1.5 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onApply({ from, to });
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-fg-subtle">Custom range</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-semibold text-fg-muted">
          From
          <Input type="date" value={from} max={to || max} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-fg-muted">
          To
          <Input type="date" value={to} min={from} max={max} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {!valid && from && to && (
        <p className="text-xs font-medium text-danger-fg">The start must be on or before the end.</p>
      )}
      <Button type="submit" size="sm" disabled={!valid}>
        Apply
      </Button>
    </form>
  );
}
