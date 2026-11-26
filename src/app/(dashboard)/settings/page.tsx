import { Suspense } from "react";
import type { Metadata } from "next";

import { SettingsForm } from "./_components/settings-form";
import { PageSkeleton } from "../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { loadSettings } from "@/lib/page-data";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <General />
    </Suspense>
  );
}

async function General() {
  const actor = await requireUser();
  return <SettingsForm initial={await loadSettings(actor.farmId)} />;
}
