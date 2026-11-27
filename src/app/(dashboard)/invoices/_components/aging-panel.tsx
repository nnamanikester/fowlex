import Link from "next/link";

import { Panel } from "@/components/kit";
import { formatNaira } from "@/lib/money";
import { AGING_BANDS, AGING_LABELS } from "@/lib/statements/rules";
import type { Aging } from "@/lib/statements/service";
import { cn } from "@/lib/utils";

/** Who owes what and how late, in four bands of days past due; nothing when nothing is owed. */
export function AgingPanel({ aging }: { aging: Aging }) {
  if (!aging.totalKobo) return null;
  return (
    <Panel
      title="Money owed, by how late"
      description={`${formatNaira(aging.totalKobo)} still to come in. Days are counted from each invoice's due date.`}
      flush
    >
      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
        {AGING_BANDS.map((b, i) => (
          <div key={b} className="min-w-0 bg-surface px-5 py-3">
            <dt className="text-xs text-fg-muted">{AGING_LABELS[b]}</dt>
            <dd
              className={cn(
                "num font-semibold [overflow-wrap:anywhere]",
                i >= 2 && aging.bands[b] ? "text-danger-fg" : "text-fg",
              )}
            >
              {formatNaira(aging.bands[b])}
            </dd>
          </div>
        ))}
      </dl>
      <ul className="divide-y divide-line">
        {aging.rows.map((r) => {
          const late = AGING_BANDS.filter((b) => b !== "0-30" && r.bands[b]);
          return (
            <li key={r.customerId}>
              <Link
                href={`/customers/${r.customerId}`}
                className="focus-ring flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle"
              >
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate font-semibold text-fg">{r.name}</span>
                  <span className="num block text-xs text-fg-muted">
                    {r.invoices === 1 ? "1 invoice" : `${r.invoices} invoices`}
                    {late.map((b) => ` · ${formatNaira(r.bands[b])} ${AGING_LABELS[b].toLowerCase()} late`).join("")}
                  </span>
                </span>
                <span className="num shrink-0 font-semibold text-fg">{formatNaira(r.totalKobo)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
