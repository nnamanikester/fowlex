import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ItemDetail } from "./_components/item-detail";
import { PageSkeleton, RequirePermission } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { today } from "@/lib/dates";
import { loadBatches, loadItems, loadMovements } from "@/lib/page-data";

export const metadata: Metadata = { title: "Stock item" };

export default function ItemPage({ params }: PageProps<"/inventory/[id]">) {
  return (
    <RequirePermission permission="inventory.read">
      <Suspense fallback={<PageSkeleton />}>
        <Item params={params} />
      </Suspense>
    </RequirePermission>
  );
}

async function Item({ params }: Pick<PageProps<"/inventory/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const [items, movements, batches] = await Promise.all([
    loadItems(user.farmId),
    loadMovements(user.farmId, id),
    loadBatches(user.farmId),
  ]);
  const item = items.find((i) => i.id === id);
  if (!item) notFound();
  return (
    <ItemDetail
      item={item}
      movements={movements}
      batches={batches
        .filter((b) => b.phase === "active" || b.phase === "selling")
        .map((b) => ({ id: b.id, code: b.code }))}
      allBatches={Object.fromEntries(batches.map((b) => [b.id, b.code]))}
      today={today()}
      canWrite={can(user.role, "inventory.write")}
    />
  );
}
