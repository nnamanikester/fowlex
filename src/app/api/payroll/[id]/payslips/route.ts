import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { payslipPdf } from "@/lib/payroll/payslips";

/** A month's payslips as one PDF, or one person's (`?line=`). */
export const GET = apiRoute(async (request: Request, context: RouteContext<"/api/payroll/[id]/payslips">) => {
  const actor = await requirePermission("payroll.read");
  const line = new URL(request.url).searchParams.get("line") ?? undefined;
  const { bytes, filename } = await payslipPdf(actor.farmId, (await context.params).id, line);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
