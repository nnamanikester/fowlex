import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { statementPdf } from "@/lib/statements/service";

/** The statement as a PDF (`?from=…&to=…`). */
export const GET = apiRoute(async (request: Request, context: RouteContext<"/api/customers/[id]/statement/pdf">) => {
  const actor = await requirePermission("invoice.read");
  const params = new URL(request.url).searchParams;
  const { bytes, filename } = await statementPdf(actor.farmId, (await context.params).id, {
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
