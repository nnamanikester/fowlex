// @vitest-environment jsdom
import * as React from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useStored } from "./use-stored";
import { useToday } from "./use-today";
import { type BatchSummary, useWorkspace, WorkspaceProvider } from "./workspace";

describe("useStored", () => {
  it("starts from the fallback, then remembers what's set across hooks", () => {
    window.localStorage.clear();
    const a = renderHook(() => useStored("fowlex_test", "0"));
    const b = renderHook(() => useStored("fowlex_test", "0"));
    expect(a.result.current[0]).toBe("0");
    act(() => a.result.current[1]("1"));
    expect(a.result.current[0]).toBe("1");
    expect(b.result.current[0]).toBe("1");
    expect(window.localStorage.getItem("fowlex_test")).toBe("1");
  });

  it("still works for the tab when storage is blocked", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useStored("fowlex_blocked", "a"));
    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");
    get.mockRestore();
    set.mockRestore();
  });
});

describe("useToday", () => {
  it("is today's Lagos date in the browser", () => {
    const { result } = renderHook(() => useToday());
    expect(result.current).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("WorkspaceProvider", () => {
  const me = { id: "u1", name: "Ada", email: "a@f.com", role: "staff" as const };
  const batches: BatchSummary[] = [
    { id: "b1", code: "B-1", house: "H1", status: "active", day: 3, liveBirds: 10 },
    { id: "b2", code: "B-2", house: "H2", status: "selling", day: 40, liveBirds: 9 },
  ];
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WorkspaceProvider me={me} batches={batches}>
      {children}
    </WorkspaceProvider>
  );

  it("knows the person, what they can do, and the chosen batch", () => {
    window.localStorage.clear();
    const { result } = renderHook(() => useWorkspace(), { wrapper });
    expect(result.current.me).toEqual(me);
    expect(result.current.can("log.write")).toBe(true);
    expect(result.current.can("finance.read")).toBe(false);
    expect(result.current.batch?.id).toBe("b1");
    act(() => result.current.setBatch("b2"));
    expect(result.current.batch?.id).toBe("b2");
  });

  it("has no batch when there are none, and refuses use outside the provider", () => {
    const empty = ({ children }: { children: React.ReactNode }) => (
      <WorkspaceProvider me={me} batches={[]}>
        {children}
      </WorkspaceProvider>
    );
    expect(renderHook(() => useWorkspace(), { wrapper: empty }).result.current.batch).toBeNull();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useWorkspace())).toThrow("useWorkspace must be used inside WorkspaceProvider");
  });
});
