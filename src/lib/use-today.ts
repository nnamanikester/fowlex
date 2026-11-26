"use client";

import * as React from "react";

import { type ISODate, today } from "@/lib/dates";

const noop = () => () => {};

/**
 * Today's Lagos date in the browser, and null while the page is prerendered: the date belongs to
 * the visit, not the build. Components show a neutral state until it arrives.
 */
export function useToday(): ISODate | null {
  return React.useSyncExternalStore(
    noop,
    () => today(),
    () => null,
  );
}
