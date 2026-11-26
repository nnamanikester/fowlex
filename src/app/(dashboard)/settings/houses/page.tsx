import { Suspense } from "react";
import type { Metadata } from "next";

import { HousesManager } from "./_components/houses-manager";
import { PageSkeleton } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { loadHouses, loadSettings } from "@/lib/page-data";

export const metadata: Metadata = { title: "Houses" };

export default function HousesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Houses />
    </Suspense>
  );
}

async function Houses() {
  const actor = await requireUser();
  const [houses, settings] = await Promise.all([loadHouses(actor.farmId), loadSettings(actor.farmId)]);
  return <HousesManager houses={houses} density={settings.stockingDensity} />;
}
