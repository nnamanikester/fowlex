import { apiRoute, HttpError, requirePermission } from "@/lib/auth/guard";
import { localUploads } from "@/lib/uploads";

/** A receipt kept in memory (development and tests), for the farm that uploaded it. */
export const GET = apiRoute(async (_request: Request, context: RouteContext<"/api/uploads/[id]">) => {
  const actor = await requirePermission("expense.read");
  const file = localUploads().get((await context.params).id);
  if (!file || file.farmId !== actor.farmId) throw new HttpError(404, "not_found", "That file isn't here.");
  return new Response(file.bytes, {
    headers: { "Content-Type": file.type, "Content-Disposition": `inline; filename="${file.name}"` },
  });
});
