import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { revokeInvite } from "@/lib/users/service";

/** Cancels a waiting invite: its link stops working. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/users/invites/[id]">) => {
  const actor = await requirePermission("settings.manage");
  await revokeInvite(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
