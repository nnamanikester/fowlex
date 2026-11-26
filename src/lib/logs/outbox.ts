"use client";

import * as React from "react";

import { type AuthError, apiRequest } from "@/lib/auth/client";

/**
 * Logs waiting on this phone for a signal. A log that can't reach the server is kept here (in
 * localStorage) with its request id, and sent when the phone is back online, on the next visit, or
 * when someone taps Send. The request id means a resend never records the same day twice. A
 * refusal the phone can't fix (say, the day was logged from another phone) is kept as a failure
 * to show, never dropped silently.
 */
export type Queued = { requestId: string; body: Record<string, unknown>; label: string; savedAt: string };
export type Failed = Queued & { message: string };

const KEY = "fowlex_log_outbox";
const FAILED = "fowlex_log_outbox_failed";

function read<T>(key: string): T[] {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}
function write(key: string, items: unknown[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Storage full or blocked: the page keeps them in memory for this visit.
  }
}

export function useLogOutbox({ onSent }: { onSent?: (count: number) => void } = {}) {
  const [queued, setQueued] = React.useState<Queued[]>([]);
  const [failed, setFailed] = React.useState<Failed[]>([]);
  const [sending, setSending] = React.useState(false);
  const busy = React.useRef(false);
  const sentCallback = React.useRef(onSent);
  React.useEffect(() => {
    sentCallback.current = onSent;
  }, [onSent]);

  const flush = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    let sent = 0;
    try {
      for (const item of read<Queued>(KEY)) {
        try {
          await apiRequest("/api/logs", "POST", { ...item.body, requestId: item.requestId });
          sent++;
        } catch (e) {
          const error = e as AuthError;
          if (error.status === 0 || error.status >= 500) break; // Still offline, or the server's down: try later.
          write(FAILED, [...read<Failed>(FAILED), { ...item, message: error.message }]);
        }
        write(
          KEY,
          read<Queued>(KEY).filter((q) => q.requestId !== item.requestId),
        );
      }
    } finally {
      busy.current = false;
      setSending(false);
      setQueued(read<Queued>(KEY));
      setFailed(read<Failed>(FAILED));
      if (sent) sentCallback.current?.(sent);
    }
  }, []);

  React.useEffect(() => {
    // Read what earlier visits left, then send it.
    void flush();
    const online = () => void flush();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [flush]);

  const enqueue = React.useCallback((item: Queued) => {
    write(KEY, [...read<Queued>(KEY).filter((q) => q.requestId !== item.requestId), item]);
    setQueued(read<Queued>(KEY));
  }, []);

  const dismiss = React.useCallback((requestId: string) => {
    write(
      FAILED,
      read<Failed>(FAILED).filter((f) => f.requestId !== requestId),
    );
    setFailed(read<Failed>(FAILED));
  }, []);

  return { queued, failed, sending, enqueue, flush, dismiss };
}
