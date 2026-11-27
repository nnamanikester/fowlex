import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteAdvance } from "@/lib/people/advances";

/** Removes an advance given by mistake, with its expense. */
export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/advances/[id]">) => {
  const actor = await requirePermission("people.write");
  await deleteAdvance(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
