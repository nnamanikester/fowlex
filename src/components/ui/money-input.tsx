"use client";

import * as React from "react";

import { inputClasses } from "./input";
import { formatNairaPlain, isTypingNaira, nairaToKobo } from "@/lib/money";
import { cn } from "@/lib/utils";

type MoneyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  /** Whole kobo, or null when empty. */
  value: number | null;
  onChange: (kobo: number | null) => void;
};

/**
 * Naira in, kobo out. People type "18,500.50" with a ₦ in front; the form gets 1850050. Keys that
 * would make it invalid (a third decimal, a letter, a minus) are ignored, so it can never yield a
 * fraction of a kobo. Commas and two decimals are filled in on blur.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, onBlur, className, ...props }, ref) => {
    const [text, setText] = React.useState(() => (value === null ? "" : formatNairaPlain(value)));

    // A value set from outside (a reset, a loaded record) replaces what is shown, while rendering.
    const [shown, setShown] = React.useState(value);
    if (value !== shown) {
      setShown(value);
      if (value !== nairaToKobo(text)) setText(value === null ? "" : formatNairaPlain(value));
    }

    return (
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[16px] text-fg-muted sm:text-sm"
        >
          ₦
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            if (!isTypingNaira(next)) return;
            setText(next);
            const kobo = nairaToKobo(next);
            setShown(kobo);
            onChange(kobo);
          }}
          onBlur={(e) => {
            const kobo = nairaToKobo(text);
            if (kobo !== null) setText(formatNairaPlain(kobo));
            onBlur?.(e);
          }}
          className={cn(inputClasses, "num pl-7", className)}
          {...props}
        />
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";
