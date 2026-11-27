import { apiRoute, requireSession } from "@/lib/auth/guard";
import { portalInvoicePdf } from "@/lib/portal/service";

/** The customer's own invoice as a PDF. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/portal/invoices/[id]/pdf">) => {
  const { bytes, filename } = await portalInvoicePdf(await requireSession(), (await context.params).id);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
