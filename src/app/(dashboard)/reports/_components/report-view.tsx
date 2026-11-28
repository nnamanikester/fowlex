import { formatNaira } from "@/lib/money";
import { type ReportTable, showCell } from "@/lib/reports/table";
import { cn } from "@/lib/utils";

/** A report as a table: its rows, a totals row, and how it was worked out. Scrolls sideways on a phone. */
export function ReportView({ table }: { table: ReportTable }) {
  const right = (i: number) => i > 0 && table.columns[i].kind !== "text";
  const cell = (v: ReportTable["rows"][number][number], i: number) => {
    const text = showCell(v, table.columns[i].kind, formatNaira);
    const negative = table.columns[i].kind === "money" && typeof v === "number" && v < 0;
    return <span className={negative ? "text-danger-fg" : undefined}>{text}</span>;
  };
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            {table.title}, {table.period}
          </caption>
          <thead className="bg-surface-subtle">
            <tr>
              {table.columns.map((c, i) => (
                <th
                  key={c.header}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-xs font-semibold whitespace-nowrap text-fg-muted",
                    right(i) ? "text-right" : "text-left",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.length ? (
              table.rows.map((row, r) => (
                <tr key={r} className="border-t border-line">
                  {row.map((v, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-4 py-3 whitespace-nowrap text-fg",
                        right(i) && "num text-right",
                        i === 0 && "font-medium",
                      )}
                    >
                      {cell(v, i)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={table.columns.length} className="px-4 py-10 text-center text-sm text-fg-muted">
                  Nothing to show for {table.period}.
                </td>
              </tr>
            )}
          </tbody>
          {table.total && table.rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-line-strong bg-surface-subtle font-semibold">
                {table.total.map((v, i) => (
                  <td
                    key={i}
                    className={cn("px-4 py-3 whitespace-nowrap text-fg-heading", right(i) && "num text-right")}
                  >
                    {cell(v, i)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {table.note && <p className="text-xs text-fg-muted">{table.note}</p>}
    </div>
  );
}
