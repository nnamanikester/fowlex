import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteMovement } from "@/lib/inventory/movements";

/** Removes a stock record made by hand. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/inventory/movements/[id]">) => {
  const actor = await requirePermission("inventory.write");
  await deleteMovement(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
