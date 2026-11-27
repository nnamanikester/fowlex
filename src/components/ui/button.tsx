"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { buttonClasses, type Size, type Variant } from "./button-classes";
import { cn } from "@/lib/utils";

export { buttonClasses };

/**
 * The button: 44px, rounded-xl, a little press on tap, and a spinner that
 * sits over the label while loading so the button never changes size.
 */
function Content({ loading, children }: { loading?: boolean; children: React.ReactNode }) {
  return (
    <>
      <span className={cn("inline-flex items-center gap-2 transition-opacity duration-200", loading && "opacity-0")}>
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="animate-spin" aria-hidden />
        </span>
      )}
    </>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  /** Why it can't be pressed yet. Shown on hover, focus or a tap, and read out with the button. */
  reason?: string;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, fullWidth, loading, disabled, reason, className, children, type = "button", ...props }, ref) => {
    const tipId = React.useId();
    const tip = React.useRef<HTMLSpanElement>(null);
    // Shown on hover, focus or a tap (for 3.5 s); nudged sideways so it never runs off the screen.
    const [open, setOpen] = React.useState<"hover" | "focus" | "tap" | null>(null);
    const [shift, setShift] = React.useState(0);
    React.useEffect(() => {
      if (open !== "tap") return;
      const t = setTimeout(() => setOpen(null), 3500);
      return () => clearTimeout(t);
    }, [open]);
    React.useLayoutEffect(() => {
      const el = tip.current;
      if (!open || !el) return;
      const r = el.getBoundingClientRect();
      const gutter = 8;
      const over = r.right - (window.innerWidth - gutter);
      const under = gutter - r.left;
      setShift((s) => s + (over > 0 ? -over : under > 0 ? under : 0));
    }, [open]);

    // Disabled with a reason: still focusable and tappable, so it can say why instead of doing nothing.
    if (disabled && reason && !loading) {
      const { onClick: _ignored, ...rest } = props;
      void _ignored;
      return (
        <span
          className={cn("relative inline-flex", fullWidth && "flex w-full")}
          onPointerEnter={(e) => e.pointerType === "mouse" && setOpen((o) => o ?? "hover")}
          onPointerLeave={(e) => e.pointerType === "mouse" && setOpen((o) => (o === "hover" ? null : o))}
        >
          {/* Keeps its type: Enter in a form "clicks" it, and the click is stopped below, so it can't submit. */}
          <button
            ref={ref}
            type={type}
            aria-disabled="true"
            aria-describedby={tipId}
            className={buttonClasses({ variant, size, fullWidth, className })}
            {...rest}
            onFocus={() => setOpen((o) => o ?? "focus")}
            onBlur={() => setOpen(null)}
            onClick={(e) => {
              e.preventDefault();
              setOpen("tap");
            }}
          >
            <Content>{children}</Content>
          </button>
          <span
            ref={tip}
            id={tipId}
            role="tooltip"
            hidden={!open}
            style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[min(18rem,calc(100vw-1rem))] animate-fade-in rounded-lg bg-fg px-3 py-2 text-center text-xs font-medium leading-5 text-fg-inverse shadow-pop"
          >
            {reason}
          </span>
        </span>
      );
    }
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonClasses({ variant, size, fullWidth, className })}
        {...props}
      >
        <Content loading={loading}>{children}</Content>
      </button>
    );
  },
);
Button.displayName = "Button";

type LinkButtonProps = React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size; fullWidth?: boolean };

/** A link that looks like a Button. */
export function LinkButton({ variant, size, fullWidth, className, children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth, className })} {...props}>
      <Content>{children}</Content>
    </Link>
  );
}
