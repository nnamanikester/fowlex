import { Suspense } from "react";
import type { Metadata } from "next";

import { LogForm } from "./_components/log-form";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { addDays } from "@/lib/dates";
import { loadBatches, loadHealth, loadItems, loadLogs, requestToday } from "@/lib/page-data";

export const metadata: Metadata = { title: "Daily log" };

export default function LogPage() {
  return (
    <RequirePermission permission="log.write">
      <PageHeader title="Daily log" description="Today's deaths, culls, feed and water for each batch." />
      <Suspense fallback={<PageSkeleton />}>
        <Log />
      </Suspense>
    </RequirePermission>
  );
}

async function Log() {
  const user = await requireUser();
  const now = await requestToday();
  const on = now;
  const batches = (await loadBatches(user.farmId)).filter((b) => b.phase === "active" || b.phase === "selling");
  // Today's and yesterday's logs for every batch on the farm, so the form opens them instantly.
  const recent = (await Promise.all(batches.map((b) => loadLogs(user.farmId, b.id))))
    .flat()
    .filter((l) => l.date >= addDays(on, -1));
  const health = (await Promise.all(batches.map((b) => loadHealth(user.farmId, b.id)))).flat();
  const feeds = (await loadItems(user.farmId))
    .filter((i) => i.category === "feed" && !i.archived)
    .map(({ id, name, unit, unitKg, onHand }) => ({ id, name, unit, unitKg, onHand }));
  return <LogForm batches={batches} recent={recent} health={health} feeds={feeds} today={on} />;
}
