// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Queued, useLogOutbox } from "./outbox";

const item = (n: number): Queued => ({
  requestId: `req-000${n}-abcd`,
  body: { batchId: "b1", date: `2026-11-2${n}`, deaths: n },
  label: `B-2026-01, 2${n} Nov`,
  savedAt: "2026-11-26T10:00:00Z",
});
const answer = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("useLogOutbox", () => {
  it("keeps a log while offline, then sends it when the phone is back online", async () => {
    const fetch = vi.fn(async (): Promise<Response> => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);
    const onSent = vi.fn();
    const { result } = renderHook(() => useLogOutbox({ onSent }));
    act(() => result.current.enqueue(item(1)));
    await act(() => result.current.flush());
    expect(result.current.queued).toHaveLength(1);
    expect(onSent).not.toHaveBeenCalled();

    fetch.mockImplementation(async () => answer(201, { id: "l1" }));
    await act(async () => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current.queued).toHaveLength(0));
    expect(onSent).toHaveBeenCalledWith(1);
    const [, init] = fetch.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ requestId: "req-0001-abcd", deaths: 1 });
  });

  it("sends what an earlier visit left, in order", async () => {
    window.localStorage.setItem("fowlex_log_outbox", JSON.stringify([item(1), item(2)]));
    const fetch = vi.fn(async () => answer(201));
    vi.stubGlobal("fetch", fetch);
    const onSent = vi.fn();
    const { result } = renderHook(() => useLogOutbox({ onSent }));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(2));
    expect(result.current.queued).toEqual([]);
  });

  it("keeps waiting while the server is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer(503)),
    );
    const { result } = renderHook(() => useLogOutbox());
    act(() => result.current.enqueue(item(1)));
    await act(() => result.current.flush());
    expect(result.current.queued).toHaveLength(1);
    expect(result.current.failed).toEqual([]);
  });

  it("shows a refusal it can't fix as a failure, never drops it silently, and lets it be dismissed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer(409, { error: { code: "already_logged", message: "Already logged." } })),
    );
    const { result } = renderHook(() => useLogOutbox());
    act(() => result.current.enqueue(item(1)));
    await act(() => result.current.flush());
    expect(result.current.queued).toEqual([]);
    expect(result.current.failed).toEqual([{ ...item(1), message: "Already logged." }]);
    act(() => result.current.dismiss(item(1).requestId));
    expect(result.current.failed).toEqual([]);
  });

  it("replaces an item queued twice, and survives storage that won't take more", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const { result } = renderHook(() => useLogOutbox());
    act(() => {
      result.current.enqueue(item(1));
      result.current.enqueue(item(1));
    });
    expect(result.current.queued).toHaveLength(1);
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => act(() => result.current.enqueue(item(2)))).not.toThrow();
    set.mockRestore();
    window.localStorage.setItem("fowlex_log_outbox", "not json");
    await act(() => result.current.flush());
    expect(result.current.queued).toEqual([]);
  });
});
