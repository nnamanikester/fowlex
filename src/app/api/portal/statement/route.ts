import { apiRoute, requireSession } from "@/lib/auth/guard";
import { portalStatementPdf } from "@/lib/portal/service";

/** The customer's statement as a PDF (`?from=…&to=…`). */
export const GET = apiRoute(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const { bytes, filename } = await portalStatementPdf(await requireSession(), {
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
