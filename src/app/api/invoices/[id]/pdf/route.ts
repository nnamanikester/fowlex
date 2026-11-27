import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { invoicePdf } from "@/lib/invoices/service";

/** The invoice as a PDF, to download or print. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/invoices/[id]/pdf">) => {
  const actor = await requirePermission("invoice.read");
  const { bytes, filename } = await invoicePdf(actor.farmId, (await context.params).id);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
