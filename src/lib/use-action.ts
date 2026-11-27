"use client";

import * as React from "react";
import { toast } from "sonner";

import { type AuthError, asProblem } from "@/lib/auth/client";

/** After this long a button says it's still working, so a slow network never looks like a dead tap. */
export const SLOW_AFTER_MS = 6_000;

type Options<T> = {
  /** Which button pressed it, so only that one spins while the others wait. */
  key?: string;
  /** Said in a toast when it works. */
  success?: string | ((result: T) => string | undefined);
  /** Errors in a toast too: for buttons outside a form, where there's no place to show them. */
  toastError?: boolean;
  /**
   * Said in a toast while it runs, which then turns into the success or the error: for menu items
   * and rows, where there's no button left to spin.
   */
  progress?: string;
  onSuccess?: (result: T) => void | Promise<void>;
};

/**
 * One thing a screen does with the server, and everything the person needs to see about it: which
 * button is working, a word when it's slow, the error (on its field and above the buttons) and a
 * toast when it's done. A second tap while one is running is ignored, so nothing is sent twice.
 * `run` never throws: it resolves to the result, or undefined when it failed.
 */
export function useAction() {
  const [pending, setPending] = React.useState<string | null>(null);
  const [slow, setSlow] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const running = React.useRef(false);
  const live = React.useRef(true);
  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const run = React.useCallback(async <T>(fn: () => Promise<T>, options: Options<T> = {}): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setPending(options.key ?? "default");
    setFailure(null);
    setSlow(false);
    const timer = setTimeout(() => live.current && setSlow(true), SLOW_AFTER_MS);
    const id = options.progress ? toast.loading(options.progress) : undefined;
    try {
      const result = await fn();
      const said = typeof options.success === "function" ? options.success(result) : options.success;
      if (said) toast.success(said, { id });
      else if (id !== undefined) toast.dismiss(id);
      await options.onSuccess?.(result);
      return result;
    } catch (e) {
      const problem = asProblem(e);
      if (live.current) setFailure(problem);
      if (options.toastError || id !== undefined) toast.error(problem.message, { id });
      return undefined;
    } finally {
      clearTimeout(timer);
      running.current = false;
      if (live.current) {
        setPending(null);
        setSlow(false);
      }
    }
  }, []);

  const clear = React.useCallback(() => setFailure(null), []);

  return {
    run,
    clear,
    failure,
    slow,
    pending,
    busy: pending !== null,
    /** Is this button the one working? */
    isPending: (key = "default") => pending === key,
    /** The message for one field: the server's, when it named this field, over the form's own check. */
    fieldError: (field: string, local?: string) => (failure?.field === field ? failure.message : local),
  };
}

export type Action = ReturnType<typeof useAction>;
