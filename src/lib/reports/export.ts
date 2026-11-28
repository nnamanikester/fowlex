import "server-only";

import { PDFDocument, StandardFonts } from "pdf-lib";

import { toCsv } from "@/lib/csv";
import { A4, BRAND, MUTED, naira, pen, TINT } from "@/lib/pdf";
import { csvCell, csvHeader, type ReportTable, showCell } from "./table";

/** The report as a CSV that opens in Excel: naira numbers, ISO dates, a totals row. */
export function reportCsv(r: ReportTable) {
  const rows = [...r.rows, ...(r.total ? [r.total] : [])].map((row) =>
    row.map((v, i) => csvCell(v, r.columns[i].kind)),
  );
  return toCsv(r.columns.map(csvHeader), rows);
}

/**
 * The report as an A4 PDF, landscape when it has many columns: the farm's name, the title and
 * period, the table with its header on every page, the totals row on a tint, and page numbers.
 */
export async function reportPdf(r: ReportTable, businessName: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${r.title} ${r.period}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const wide = r.columns.length > 5;
  const size: [number, number] = wide ? [A4[1], A4[0]] : A4;
  const margin = 48;
  const width = size[0] - margin * 2;
  // The first column gets the room it needs; the rest share what's left.
  const first = Math.min(wide ? 180 : 170, width * 0.34);
  const rest = (width - first) / Math.max(1, r.columns.length - 1);
  /** Where column i starts (the first) or ends (the rest, which align right). */
  const xOf = (i: number) => (i === 0 ? margin : margin + first + rest * i);
  const show = (v: (typeof r.rows)[number][number], i: number) => showCell(v, r.columns[i].kind, naira);
  const pages: ReturnType<typeof pdf.addPage>[] = [];

  let page = pdf.addPage(size);
  pages.push(page);
  let tools = pen(page, regular, margin);
  let y = size[1] - 56;
  tools.text(businessName || "Farm", margin, y, { font: bold, size: 16 });
  tools.text(r.title.toUpperCase(), size[0] - margin, y, { font: bold, size: 14, color: BRAND, align: "right" });
  y -= 18;
  tools.text(r.period, size[0] - margin, y, { color: MUTED, align: "right" });
  y -= 24;

  const header = () => {
    r.columns.forEach((c, i) =>
      tools.text(i === 0 ? c.header : tools.fit(c.header, rest - 6, bold, 9), i === 0 ? xOf(0) : xOf(i), y, {
        font: bold,
        size: 9,
        align: i === 0 ? "left" : "right",
      }),
    );
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: size[0] - margin, y }, thickness: 0.75, color: MUTED });
    y -= 15;
  };
  const row = (cells: (typeof r.rows)[number], font = regular) => {
    cells.forEach((v, i) => {
      const text = show(v, i);
      if (i === 0) tools.text(tools.fit(text, first - 8, font, 9), xOf(0), y, { font, size: 9 });
      else tools.text(tools.fit(text, rest - 6, font, 9), xOf(i), y, { font, size: 9, align: "right" });
    });
  };

  header();
  if (!r.rows.length) {
    tools.text("Nothing to show for this period.", margin, y, { color: MUTED });
    y -= 15;
  }
  for (const cells of r.rows) {
    if (y < 72) {
      page = pdf.addPage(size);
      pages.push(page);
      tools = pen(page, regular, margin);
      y = size[1] - 56;
      header();
    }
    row(cells);
    y -= 15;
  }
  if (r.total) {
    if (y < 72) {
      page = pdf.addPage(size);
      pages.push(page);
      tools = pen(page, regular, margin);
      y = size[1] - 56;
    }
    page.drawRectangle({ x: margin, y: y - 6, width, height: 20, color: TINT });
    row(r.total, bold);
    y -= 24;
  }
  if (r.note && y > 72) tools.text(tools.fit(r.note, width), margin, y - 4, { size: 8, color: MUTED });
  pages.forEach((p, i) => {
    const t = pen(p, regular, margin);
    t.text(`${businessName} · ${r.title}, ${r.period}`, margin, 28, { size: 8, color: MUTED });
    t.text(`Page ${i + 1} of ${pages.length}`, size[0] - margin, 28, { size: 8, color: MUTED, align: "right" });
  });
  return pdf.save();
}
