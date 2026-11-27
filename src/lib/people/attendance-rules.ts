// Safe for the browser: no model or database imports here.

/** A day's attendance: came, came for half the day, or didn't come. */
export const ATTENDANCE = ["present", "half", "absent"] as const;
export type Attendance = (typeof ATTENDANCE)[number];
export const ATTENDANCE_LABELS: Record<Attendance, string> = { present: "Came", half: "Half day", absent: "Absent" };
/** How much of a day's pay each earns. */
export const DAY_SHARE: Record<Attendance, number> = { present: 1, half: 0.5, absent: 0 };

/** "21 days", "1 day", "4½ days". */
export function formatDays(days: number) {
  const whole = Math.floor(days);
  const half = days - whole >= 0.5 ? "½" : "";
  const shown = whole === 0 && half ? half : `${whole}${half}`;
  return `${shown} ${days === 0.5 || days === 1 ? "day" : "days"}`;
}
