"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Check, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth";
import { ConfirmDialog, EmptyState, Panel } from "@/components/kit";
import { Button, LinkButton } from "@/components/ui/button";
import { type AuthError, apiRequest, asProblem } from "@/lib/auth/client";
import { addDays } from "@/lib/dates";
import { formatNaira } from "@/lib/money";
import { ATTENDANCE, ATTENDANCE_LABELS, type Attendance, formatDays } from "@/lib/people/attendance-rules";
import type { AttendanceRow } from "@/lib/people/attendance";
import { cn } from "@/lib/utils";

const dayName = (date: string, today: string) =>
  date === today
    ? "Today"
    : date === addDays(today, -1)
      ? "Yesterday"
      : new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
          new Date(`${date}T00:00:00Z`),
        );

/** A day's sheet: tap who came. Someone who sent in the day's log is already ticked. */
export function AttendanceSheet({
  date,
  today,
  rows,
  month,
  canWrite,
}: {
  date: string;
  today: string;
  rows: AttendanceRow[];
  /** Days each person has worked this month, up to this day. */
  month: Record<string, number>;
  canWrite: boolean;
}) {
  const router = useRouter();
  const start = () => Object.fromEntries(rows.map((r) => [r.employeeId, r.status ?? (r.logged ? "present" : null)]));
  const [marks, setMarksState] = React.useState<Record<string, Attendance | null>>(start);
  // Marks they've tapped and not saved: moving to another day asks first, so they aren't lost.
  const [edited, setEdited] = React.useState(false);
  const [leavingTo, setLeavingTo] = React.useState<string | null>(null);
  const setMarks: typeof setMarksState = (next) => {
    setEdited(true);
    setMarksState(next);
  };
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const changed = rows.some((r) => marks[r.employeeId] !== r.status);
  const unmarked = rows.filter((r) => !marks[r.employeeId]).length;

  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await apiRequest("/api/attendance", "POST", {
        date,
        entries: rows.map((r) => ({ employeeId: r.employeeId, status: marks[r.employeeId] ?? null })),
      });
      const came = rows.filter((r) => marks[r.employeeId] === "present" || marks[r.employeeId] === "half").length;
      toast.success(`Saved: ${came} of ${rows.length} came ${date === today ? "today" : "that day"}.`);
      setEdited(false);
      router.refresh();
    } catch (e) {
      // Save floats at the bottom on a phone, far from the alert at the top: say it there too.
      const problem = asProblem(e);
      setFailure(problem);
      toast.error(problem.message);
    } finally {
      setBusy(false);
    }
  };

  const leave = (d: string) => router.push(d === today ? "/people/attendance" : `/people/attendance?date=${d}`);
  const go = (d: string) => (edited && changed ? setLeavingTo(d) : leave(d));

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" aria-label="The day before" onClick={() => go(addDays(date, -1))}>
          <ChevronLeft />
        </Button>
        <label className="relative min-w-0 flex-1 text-center">
          <span className="block font-display text-lg font-bold text-fg-heading">{dayName(date, today)}</span>
          <input
            type="date"
            aria-label="Day"
            value={date}
            max={today}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="focus-ring mx-auto block rounded-md bg-transparent text-center text-sm text-fg-muted"
          />
        </label>
        <Button
          variant="ghost"
          size="sm"
          aria-label="The day after"
          disabled={date >= today}
          reason="That day hasn't come yet."
          onClick={() => go(addDays(date, 1))}
        >
          <ChevronRight />
        </Button>
      </div>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<CalendarCheck />}
            title="No one paid by the day"
            description="Attendance is for people paid by the day. Add them, or change someone's pay to by the day, on People."
            action={
              <LinkButton size="sm" variant="secondary" href="/people">
                Go to People
              </LinkButton>
            }
          />
        </Panel>
      ) : (
        <>
          {failure && <FormAlert title={failure.message} />}
          {canWrite && unmarked > 0 && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() =>
                setMarks((m) => Object.fromEntries(rows.map((r) => [r.employeeId, m[r.employeeId] ?? "present"])))
              }
            >
              <ClipboardCheck /> {unmarked === rows.length ? "Everyone came" : `The other ${unmarked} came`}
            </Button>
          )}
          <Panel flush>
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const mark = marks[r.employeeId];
                return (
                  <li key={r.employeeId} className="space-y-3 px-4 py-4 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate font-semibold text-fg">{r.name}</p>
                        <p className="text-xs text-fg-muted">
                          {r.logged && !r.status
                            ? "Sent in the daily log, so ticked as came"
                            : r.job || "Paid by the day"}
                        </p>
                      </div>
                      <p className="num shrink-0 text-right text-xs text-fg-muted">
                        <span className="block font-semibold text-fg">{formatDays(month[r.employeeId] ?? 0)}</span>
                        {formatNaira(Math.round((month[r.employeeId] ?? 0) * r.rateKobo))} this month
                      </p>
                    </div>
                    <div role="group" aria-label={`${r.name}: came to work?`} className="grid grid-cols-3 gap-2">
                      {ATTENDANCE.map((a) => (
                        <button
                          key={a}
                          type="button"
                          disabled={!canWrite}
                          aria-pressed={mark === a}
                          onClick={() => setMarks((m) => ({ ...m, [r.employeeId]: m[r.employeeId] === a ? null : a }))}
                          className={cn(
                            "focus-ring flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold",
                            mark === a
                              ? a === "absent"
                                ? "border-danger bg-danger-subtle text-danger-fg"
                                : "border-brand bg-brand-subtle text-brand-fg"
                              : "border-line bg-surface text-fg-muted enabled:hover:border-line-strong",
                          )}
                        >
                          {mark === a && <Check className="size-4" aria-hidden />}
                          {ATTENDANCE_LABELS[a]}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
          {canWrite && (
            // Above the phone's tab bar, like the add button elsewhere.
            <div className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 lg:static">
              <Button
                size="lg"
                fullWidth
                loading={busy}
                disabled={!changed}
                reason="Nothing has changed yet: tap who came first."
                onClick={() => void save()}
                className="shadow-pop lg:shadow-none"
              >
                {changed ? "Save attendance" : "Saved"}
              </Button>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={leavingTo !== null}
        onOpenChange={(open) => !open && setLeavingTo(null)}
        title="Leave without saving?"
        description={`The marks you made for ${["Today", "Yesterday"].includes(dayName(date, today)) ? dayName(date, today).toLowerCase() : dayName(date, today)} aren't saved yet.`}
        confirmLabel="Leave"
        onConfirm={() => {
          if (leavingTo) leave(leavingTo);
        }}
      />
    </div>
  );
}
