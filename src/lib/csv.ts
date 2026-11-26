/**
 * CSV that opens cleanly in Excel: a byte-order mark so ₦ shows, every field quoted, and formulas
 * neutralised (a cell starting with = + - @ is prefixed with ') so a customer name can't run in a
 * spreadsheet. Negative money stays a number: pass amounts as numbers, not formatted strings.
 */
export type CsvValue = string | number | null | undefined;

const FORMULA = /^[=+\-@\t\r]/;

function field(value: CsvValue) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const safe = FORMULA.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: CsvValue[][]) {
  return "﻿" + [header, ...rows].map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}

/** Starts a download of `csv` as `filename` in the browser. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
