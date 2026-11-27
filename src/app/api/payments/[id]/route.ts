import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { removePayment } from "@/lib/payments/service";

/** Takes back a payment recorded by mistake. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/payments/[id]">) => {
  const actor = await requirePermission("payment.write");
  await removePayment(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
