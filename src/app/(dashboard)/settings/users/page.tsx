import { Suspense } from "react";
import type { Metadata } from "next";

import { TeamManager } from "./_components/team-manager";
import { PageSkeleton } from "../../_components/require-permission";
import { requireUser } from "@/lib/auth/current-user";
import { listTeam } from "@/lib/users/service";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Users />
    </Suspense>
  );
}

async function Users() {
  const actor = await requireUser();
  return <TeamManager team={await listTeam(actor)} />;
}
