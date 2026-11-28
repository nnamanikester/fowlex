import { apiRoute, HttpError } from "@/lib/auth/guard";
import { payPage } from "@/lib/collections/service";
import { invoicePdf } from "@/lib/invoices/service";
import { InvoiceModel } from "@/models/invoice";

/** The invoice as a PDF, for whoever has its pay link. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/public/pay/[token]/pdf">) => {
  const { token } = await context.params;
  if (!(await payPage(token))) throw new HttpError(404, "not_found", "This pay link doesn't work any more.");
  const invoice = (await InvoiceModel.findOne({ payToken: token }, { farmId: 1 }).lean())!;
  const { bytes, filename } = await invoicePdf(String(invoice.farmId), String(invoice._id));
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
