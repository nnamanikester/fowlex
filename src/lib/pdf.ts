import "server-only";

import { type PDFFont, type PDFPage, rgb } from "pdf-lib";

import { formatRange } from "@/lib/dates";

/** PDF text: the standard fonts cover Latin-1 and a few more, so ₦ becomes NGN and accents drop. */
export const ascii = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/₦/g, "NGN ")
    .replace(/[−–]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF•—×½]/g, "");

export const naira = (kobo: number) =>
  `${kobo < 0 ? "-" : ""}NGN ${(Math.abs(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const pdfDay = (d: string) => formatRange({ from: d, to: d });

export const INK = rgb(0.11, 0.13, 0.12);
export const MUTED = rgb(0.42, 0.45, 0.43);
export const LINE = rgb(0.86, 0.87, 0.86);
export const BRAND = rgb(0.13, 0.42, 0.25);
export const TINT = rgb(0.93, 0.96, 0.94);
/** A4, in points. */
export const A4: [number, number] = [595.28, 841.89];

type TextOptions = { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: "left" | "right" };

/** Drawing helpers for one page: text (left or right aligned, Latin-1 safe) and a hairline rule. */
export function pen(page: PDFPage, regular: PDFFont, margin = 56) {
  const left = margin;
  const right = A4[0] - margin;
  const text = (
    t: string,
    x: number,
    at: number,
    { font = regular, size = 10, color = INK, align = "left" }: TextOptions = {},
  ) => {
    const clean = ascii(t);
    const width = font.widthOfTextAtSize(clean, size);
    page.drawText(clean, { x: align === "right" ? x - width : x, y: at, size, font, color });
  };
  /** Text cut to fit a width, ending in "...". */
  const fit = (t: string, width: number, font: PDFFont = regular, size = 10) => {
    let s = ascii(t);
    if (font.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > width) s = s.slice(0, -1);
    return `${s}...`;
  };
  const rule = (at: number) =>
    page.drawLine({ start: { x: left, y: at }, end: { x: right, y: at }, thickness: 0.75, color: LINE });
  return { left, right, text, fit, rule };
}
