import { connection } from "next/server";

import { apiRoute, HttpError, requirePermission } from "@/lib/auth/guard";
import { today } from "@/lib/dates";
import { buildReport, readOptions, REPORTS, type ReportKind } from "@/lib/reports/build";
import { reportCsv, reportPdf } from "@/lib/reports/export";
import { readSettings } from "@/lib/settings/service";

/** A report as a file: `?format=csv` (opens in Excel) or `?format=pdf`, with the page's options. */
export const GET = apiRoute(async (request: Request, context: RouteContext<"/api/reports/[kind]">) => {
  await connection();
  const actor = await requirePermission("finance.read");
  const kind = (await context.params).kind as ReportKind;
  if (!REPORTS.includes(kind)) throw new HttpError(404, "not_found", "There's no such report.");
  const params = new URL(request.url).searchParams;
  const report = await buildReport(actor.farmId, kind, readOptions(params, today()));
  const headers = { "Cache-Control": "private, no-store" };
  if (params.get("format") === "pdf") {
    const settings = await readSettings(actor.farmId);
    return new Response(Buffer.from(await reportPdf(report, settings.businessName)), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${report.filename}.pdf"`,
      },
    });
  }
  return new Response(reportCsv(report), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.filename}.csv"`,
    },
  });
});
