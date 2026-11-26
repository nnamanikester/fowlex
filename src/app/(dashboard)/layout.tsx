import { Suspense } from "react";

import { ShellFallback } from "./_components/shell-fallback";
import { DashboardShell } from "@/components/shell";
import { requireUser } from "@/lib/auth/current-user";
import { WorkspaceProvider } from "@/lib/workspace";
import { PREVIEW_BATCHES } from "@/lib/workspace-preview";

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
  const { id, name, email, role } = await requireUser();
  return (
    <WorkspaceProvider me={{ id, name, email, role }} batches={PREVIEW_BATCHES}>
      <DashboardShell>{children}</DashboardShell>
    </WorkspaceProvider>
  );
}
