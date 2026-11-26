import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { resendInvite } from "@/lib/users/service";

/** Emails a fresh link for a waiting invite; the old one stops working. */
export const POST = apiRoute(async (request: Request, context: RouteContext<"/api/users/invites/[id]/resend">) => {
  const actor = await requirePermission("settings.manage");
  await resendInvite(actor, (await context.params).id, new URL(request.url).origin);
  return new Response(null, { status: 204 });
});
