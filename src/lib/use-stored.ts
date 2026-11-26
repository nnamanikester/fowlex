"use client";

import * as React from "react";

const EVENT = "fowlex:stored";
/** Fallback for this tab when localStorage is blocked (private mode). */
const memory = new Map<string, string>();

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function read(key: string) {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/**
 * A per-browser preference in localStorage (the folded sidebar, the chosen batch). The server and
 * the first client render use `fallback`, so hydration always matches; the stored value follows.
 */
export function useStored(key: string, fallback: string): [string, (next: string) => void] {
  const value = React.useSyncExternalStore(
    subscribe,
    () => read(key) ?? fallback,
    () => fallback,
  );
  const set = React.useCallback(
    (next: string) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Blocked: kept in memory for this tab only.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
