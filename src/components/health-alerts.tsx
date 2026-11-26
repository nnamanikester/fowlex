"use client";

import Link from "next/link";
import { Pill, TriangleAlert } from "lucide-react";

import { formatRange } from "@/lib/dates";
import type { Dose } from "@/lib/health/rules";

const day = (d: string) => formatRange({ from: d, to: d });

/** Doses due now and any drug withdrawal, for the overview and the daily log. */
export function HealthAlerts({
  attention,
  withdrawal,
  href,
}: {
  attention: Dose[];
  withdrawal: string | null;
  href?: string;
}) {
  if (!attention.length && !withdrawal) return null;
  return (
    <div role="status" className="space-y-2 rounded-xl border border-warning-line bg-warning-subtle px-4 py-3 text-sm">
      {attention.map((d) => (
        <p key={d.key} className="flex items-start gap-2 text-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden />
          <span>
            <strong>{d.vaccine}</strong> {d.state === "overdue" ? `was due ${day(d.dueOn)}` : `is due (day ${d.day})`}.{" "}
            {href && (
              <Link href={href} className="font-semibold text-brand-fg underline-offset-4 hover:underline">
                Record it
              </Link>
            )}
          </span>
        </p>
      ))}
      {withdrawal && (
        <p className="flex items-start gap-2 text-fg">
          <Pill className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden />
          <span>
            Drug withdrawal: <strong>no birds sold for meat until after {day(withdrawal)}</strong>.
          </span>
        </p>
      )}
    </div>
  );
}
