"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { FormAlert } from "@/components/auth/form-alert";
import type { AuthError } from "@/lib/auth/client";

/**
 * What happened to the last tap, right above the buttons where it's always in view: the error in
 * plain words, or a note that a slow answer is still coming. When the error is about one field,
 * that field is brought into view too.
 */
export function ActionFeedback({
  action,
  className,
}: {
  action: { failure: AuthError | null; slow?: boolean };
  className?: string;
}) {
  const { failure, slow } = action;
  React.useEffect(() => {
    if (!failure?.field) return;
    const target =
      document.querySelector<HTMLElement>(`[data-field="${failure.field}"]`) ?? document.getElementById(failure.field);
    target?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [failure]);

  if (failure) return <FormAlert title={failure.message} className={className} />;
  if (slow)
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Still working on it. A slow network can take a
        moment.
      </p>
    );
  return null;
}
