"use client";

import * as React from "react";

type Shell = {
  /** The sidebar folded to a rail of icons (desktop only; remembered per browser). */
  collapsed: boolean;
  toggleCollapsed: () => void;
  openPalette: () => void;
};

export const ShellContext = React.createContext<Shell>({
  collapsed: false,
  toggleCollapsed: () => undefined,
  openPalette: () => undefined,
});

export const useShell = () => React.useContext(ShellContext);

const noop = () => () => {};

/** ⌘K on Apple keyboards, Ctrl K elsewhere. "Ctrl" on the server and during hydration. */
export function useModKey() {
  return React.useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}
