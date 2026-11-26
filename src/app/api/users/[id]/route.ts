import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { updateMember } from "@/lib/users/service";

/** Changes someone's role, or turns their account off or on (owners only). */
export const PATCH = apiRoute(async (request: Request, context: RouteContext<"/api/users/[id]">) => {
  const actor = await requirePermission("settings.manage");
  const body = (await request.json().catch(() => ({}))) as { role?: unknown; status?: unknown };
  await updateMember(actor, (await context.params).id, {
    role: body.role === undefined ? undefined : String(body.role),
    status: body.status === undefined ? undefined : String(body.status),
  });
  return new Response(null, { status: 204 });
});
