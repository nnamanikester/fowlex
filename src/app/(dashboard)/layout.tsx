import { Suspense } from "react";

import { ShellFallback } from "./_components/shell-fallback";
import { DashboardShell } from "@/components/shell";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { loadBatchSummaries } from "@/lib/page-data";
import { WorkspaceProvider } from "@/lib/workspace";

/**
 * Every signed-in page sits in the shell. The session is read at request time, so it streams in
 * behind a Suspense boundary; the static frame shows meanwhile.
 */
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <SignedIn>{children}</SignedIn>
    </Suspense>
  );
}

async function SignedIn({ children }: { children: React.ReactNode }) {
  const { id, name, email, role, farmId } = await requireUser();
  // The batches the switcher offers; roles that can't see batches get none.
  const batches = can(role, "batch.read") ? await loadBatchSummaries(farmId) : [];
  return (
    <WorkspaceProvider me={{ id, name, email, role }} batches={batches}>
      <DashboardShell>{children}</DashboardShell>
    </WorkspaceProvider>
  );
}
