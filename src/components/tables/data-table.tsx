"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type CsvValue, downloadCsv, toCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** What the column sorts by. Omit to make it unsortable. Money sorts by kobo. */
  sortValue?: (row: T) => string | number | null;
  /** The column in search and CSV. Money exports as naira numbers, not formatted text. */
  csv?: (row: T) => CsvValue;
  /** Numbers and money align right, with tabular figures. */
  align?: "left" | "right";
  /** Hidden below this breakpoint, so the essentials fit a phone. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

type Sort = { id: string; dir: "asc" | "desc" };

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/**
 * The list every page uses: sortable headers, a search box over the CSV columns, room for filters,
 * pages of `pageSize`, an empty state, CSV export and optional row clicks. Data is in memory; pages
 * that outgrow that pass already-filtered rows from the server.
 */
export function DataTable<T>({
  label,
  rows,
  columns,
  getRowId,
  search = true,
  searchPlaceholder = "Search",
  toolbar,
  pageSize = 20,
  initialSort,
  empty,
  csv,
  onRowClick,
}: {
  /** What the table lists, for screen readers ("Invoices"). */
  label: string;
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  search?: boolean;
  searchPlaceholder?: string;
  /** Filters and actions beside the search box. */
  toolbar?: React.ReactNode;
  pageSize?: number;
  initialSort?: Sort;
  /** Shown when there are no rows at all (a search with no matches says so itself). */
  empty?: React.ReactNode;
  /** Adds an Export CSV button; the file is named `${filename}.csv`. */
  csv?: { filename: string };
  onRowClick?: (row: T) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<Sort | undefined>(initialSort);
  const [page, setPage] = React.useState(0);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searchable = columns.filter((c) => c.csv);
  const filtered = words.length
    ? rows.filter((row) => {
        const text = searchable
          .map((c) => String(c.csv!(row) ?? ""))
          .join(" ")
          .toLowerCase();
        return words.every((w) => text.includes(w));
      })
    : rows;

  const sortColumn = columns.find((c) => c.id === sort?.id);
  const sorted = sortColumn?.sortValue
    ? [...filtered].sort((a, b) => {
        const x = sortColumn.sortValue!(a);
        const y = sortColumn.sortValue!(b);
        // Empty values go last, whichever way it's sorted.
        if (x === null || x === "") return 1;
        if (y === null || y === "") return -1;
        const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sort!.dir === "asc" ? order : -order;
      })
    : filtered;

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = sorted.slice(current * pageSize, (current + 1) * pageSize);

  const toggleSort = (id: string) => {
    setSort((s) => (s?.id !== id ? { id, dir: "asc" } : s.dir === "asc" ? { id, dir: "desc" } : undefined));
    setPage(0);
  };

  const exportCsv = () => {
    const cols = columns.filter((c) => c.csv);
    downloadCsv(
      `${csv!.filename}.csv`,
      toCsv(
        cols.map((c) => c.header),
        sorted.map((row) => cols.map((c) => c.csv!(row))),
      ),
    );
  };

  if (!rows.length && empty) return <>{empty}</>;

  return (
    <div className="space-y-3">
      {(search || toolbar || csv) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <span className="sr-only">Search {label.toLowerCase()}</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-[16px] text-fg shadow-button placeholder:text-fg-subtle focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 sm:text-sm"
              />
            </label>
          )}
          {toolbar}
          {csv && (
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              onClick={exportCsv}
              disabled={!sorted.length}
              reason="There's nothing to export."
            >
              <Download /> Export CSV
            </Button>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{label}</caption>
          <thead className="bg-surface-subtle">
            <tr>
              {columns.map((c) => {
                const dir = sort?.id === c.id ? sort.dir : undefined;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    className={cn(
                      "whitespace-nowrap border-b border-line px-4 py-2.5 text-xs font-semibold text-fg-muted",
                      c.align === "right" ? "text-right" : "text-left",
                      c.hideBelow && HIDE[c.hideBelow],
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn(
                          "focus-ring -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:text-fg",
                          dir && "text-fg",
                        )}
                      >
                        {c.header}
                        {dir === "asc" ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : dir === "desc" ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-line last:border-0",
                  onRowClick && "cursor-pointer transition-colors hover:bg-surface-subtle",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "px-4 py-3 align-middle text-fg",
                      c.align === "right" && "num text-right",
                      c.hideBelow && HIDE[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-fg-muted">
                  {words.length ? <>Nothing matches &ldquo;{query}&rdquo;.</> : "Nothing here yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-3 text-sm text-fg-muted">
          <span className="num" aria-live="polite">
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <span className="flex gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
