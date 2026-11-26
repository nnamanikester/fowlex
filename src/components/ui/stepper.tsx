"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";

import { inputClasses } from "./input";
import { cn } from "@/lib/utils";

/**
 * A count with big − and + buttons either side, for thumbs in a poultry house: tap to adjust, or
 * type the number. Never below `min`.
 */
export function Stepper({
  id,
  value,
  onChange,
  min = 0,
  label,
  invalid,
  describedBy,
}: {
  id: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  label: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const safe = Number.isFinite(value) ? value : min;
  const button =
    "focus-ring grid size-14 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface text-fg shadow-button active:scale-95 disabled:opacity-40 [&_svg]:size-5";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={button}
        aria-label={`One less ${label.toLowerCase()}`}
        disabled={safe <= min}
        onClick={() => onChange(Math.max(min, safe - 1))}
      >
        <Minus aria-hidden />
      </button>
      <input
        id={id}
        inputMode="numeric"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "");
          onChange(raw === "" ? Number.NaN : Number(raw));
        }}
        onFocus={(e) => e.target.select()}
        className={cn(inputClasses, "num h-14 text-center text-2xl font-semibold sm:text-2xl")}
      />
      <button
        type="button"
        className={button}
        aria-label={`One more ${label.toLowerCase()}`}
        onClick={() => onChange(safe + 1)}
      >
        <Plus aria-hidden />
      </button>
    </div>
  );
}
