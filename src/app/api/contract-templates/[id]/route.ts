import { apiRoute, requirePermission } from "@/lib/auth/guard";
import { deleteTemplate } from "@/lib/contracts/service";

export const DELETE = apiRoute(async (_request: Request, context: RouteContext<"/api/contract-templates/[id]">) => {
  const actor = await requirePermission("contract.write");
  await deleteTemplate(actor, (await context.params).id);
  return new Response(null, { status: 204 });
});
