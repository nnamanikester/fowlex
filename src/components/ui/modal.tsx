"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A modal: a bottom sheet on phones, a centred card from 640px. Built on the native
 * <dialog> (showModal), so focus is trapped, Escape closes it and the page behind is inert without
 * extra code. `compact` is the small centred confirmation size with no title bar.
 */
export function Modal({
  open,
  onClose,
  title,
  compact,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        // A bottom sheet on phones, centred above. Margins are !important: the dialog sits inside
        // layouts that space their children (space-y-*), which would push it off centre (see Sheet).
        "w-full max-w-none overflow-visible bg-transparent p-0 text-fg backdrop:bg-charcoal/50 backdrop:backdrop-blur-[2px] max-sm:!m-0 max-sm:!mt-auto max-sm:max-h-[90dvh] sm:!m-auto sm:max-h-[calc(100dvh-4rem)]",
        compact ? "sm:max-w-sm" : "sm:max-w-lg",
      )}
    >
      {open && (
        <div className="animate-slide-up rounded-t-2xl border border-line bg-surface-raised shadow-pop sm:animate-pop-in sm:rounded-2xl">
          {!compact && title && (
            <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
              <h2 className="text-lg font-bold text-fg-heading">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="focus-ring -mr-2 inline-flex size-9 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-subtle hover:text-fg"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}
          <div className="max-h-[80dvh] overflow-y-auto sm:max-h-[calc(100dvh-9rem)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}
