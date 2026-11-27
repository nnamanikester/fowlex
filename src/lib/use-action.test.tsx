// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SLOW_AFTER_MS, useAction } from "./use-action";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t1"), dismiss: vi.fn() },
}));

afterEach(() => vi.useRealTimers());

describe("useAction", () => {
  it("says which button is working, then says it worked", async () => {
    const { result } = renderHook(() => useAction());
    let finish!: (v: { id: string }) => void;
    const onSuccess = vi.fn();
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.run(() => new Promise<{ id: string }>((r) => (finish = r)), {
        key: "save",
        success: (r) => `Saved ${r.id}.`,
        onSuccess,
      });
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.isPending("save")).toBe(true);
    expect(result.current.isPending()).toBe(false);
    await act(async () => {
      finish({ id: "a" });
      expect(await done).toEqual({ id: "a" });
    });
    expect(result.current.busy).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Saved a.", { id: undefined });
    expect(onSuccess).toHaveBeenCalledWith({ id: "a" });
  });

  it("keeps the error, on its field over the form's own check, and never throws", async () => {
    const { result } = renderHook(() => useAction());
    await act(async () => {
      expect(
        await result.current.run(() =>
          Promise.reject({ status: 503, code: "paystack_unavailable", message: "Try again.", field: "bank" }),
        ),
      ).toBeUndefined();
    });
    expect(result.current.failure?.message).toBe("Try again.");
    expect(result.current.fieldError("bank", "Local")).toBe("Try again.");
    expect(result.current.fieldError("name", "Local")).toBe("Local");
    expect(toast.error).not.toHaveBeenCalled();
    act(() => result.current.clear());
    expect(result.current.failure).toBeNull();
  });

  it("ignores a second tap while the first is running", async () => {
    const { result } = renderHook(() => useAction());
    const fn = vi.fn(() => new Promise((r) => setTimeout(r, 10)));
    await act(async () => {
      const first = result.current.run(fn);
      expect(await result.current.run(fn)).toBeUndefined();
      await first;
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("shows progress in a toast that becomes the error, and says when it's slow", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAction());
    let fail!: (e: unknown) => void;
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.run(() => new Promise((_, reject) => (fail = reject)), { progress: "Saving…" });
    });
    expect(toast.loading).toHaveBeenCalledWith("Saving…");
    act(() => vi.advanceTimersByTime(SLOW_AFTER_MS));
    expect(result.current.slow).toBe(true);
    await act(async () => {
      fail(new Error("boom"));
      await done;
    });
    expect(result.current.slow).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Something went wrong/), { id: "t1" });
  });

  it("dismisses the progress toast when there's nothing to say, and can toast errors on its own", async () => {
    const { result } = renderHook(() => useAction());
    await act(async () => {
      await result.current.run(async () => 1, { progress: "Working…" });
    });
    expect(toast.dismiss).toHaveBeenCalledWith("t1");
    await act(async () => {
      await result.current.run(() => Promise.reject({ status: 400, code: "x", message: "No." }), { toastError: true });
    });
    expect(toast.error).toHaveBeenCalledWith("No.", { id: undefined });
  });

  it("doesn't touch state after the screen has gone", async () => {
    const { result, unmount } = renderHook(() => useAction());
    let fail!: (e: unknown) => void;
    let done!: Promise<unknown>;
    act(() => {
      done = result.current.run(() => new Promise((_, reject) => (fail = reject)));
    });
    unmount();
    fail({ status: 400, code: "x", message: "No." });
    expect(await done).toBeUndefined();
  });
});
