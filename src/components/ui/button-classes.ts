import { cn } from "@/lib/utils";

/**
 * The button's look, for anything that should look like one (links, downloads). Kept apart from
 * the Button component so server pages can use it too.
 */
export type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type Size = "sm" | "md" | "lg" | "icon";

// Each disabled look is repeated for aria-disabled: a button with a reason stays focusable to say why.
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-solid text-brand-ink shadow-button hover:bg-brand-solid-hover disabled:bg-surface-muted disabled:text-fg-subtle disabled:shadow-none aria-disabled:bg-surface-muted aria-disabled:text-fg-subtle aria-disabled:shadow-none",
  secondary:
    "border border-line bg-surface text-fg shadow-button hover:border-line-strong hover:bg-brand-subtle disabled:text-fg-subtle disabled:shadow-none aria-disabled:bg-surface aria-disabled:text-fg-subtle aria-disabled:shadow-none",
  ghost:
    "text-fg-muted hover:bg-surface-subtle hover:text-fg disabled:text-fg-subtle aria-disabled:bg-transparent aria-disabled:text-fg-subtle",
  danger:
    "bg-danger text-white shadow-button hover:bg-danger/90 disabled:opacity-50 disabled:shadow-none aria-disabled:opacity-50 aria-disabled:shadow-none",
  link: "h-auto min-h-0 px-0 text-brand-fg underline-offset-4 hover:underline active:scale-100",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-9 rounded-lg px-3 text-sm",
  md: "min-h-11 rounded-xl px-4 text-sm",
  lg: "min-h-12 rounded-xl px-5 text-base",
  icon: "size-10 rounded-xl",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: { variant?: Variant; size?: Size; fullWidth?: boolean; className?: string } = {}) {
  return cn(
    "focus-ring relative inline-flex select-none items-center justify-center gap-2 font-semibold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0",
    SIZES[size],
    VARIANTS[variant],
    fullWidth && "w-full",
    className,
  );
}
