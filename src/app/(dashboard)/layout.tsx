import { Suspense } from "react";

import { ShellFallback } from "./_components/shell-fallback";
import { TestModeBanner } from "@/components/kit";
import { DashboardShell } from "@/components/shell";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { loadBatchSummaries, loadItems } from "@/lib/page-data";
import { pendingApprovals } from "@/lib/expenses/service";
import { paystackMode } from "@/lib/paystack/client";
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
  const [batches, items, waiting] = await Promise.all([
    can(role, "batch.read") ? loadBatchSummaries(farmId) : [],
    can(role, "inventory.read") ? loadItems(farmId) : [],
    can(role, "expense.approve") ? pendingApprovals(farmId) : 0,
  ]);
  // Items at or under their reorder level on Inventory; expenses waiting for an owner on Expenses.
  const low = items.filter((i) => i.low).length;
  const badges =
    low || waiting ? { ...(low && { "/inventory": low }), ...(waiting && { "/expenses": waiting }) } : undefined;
  // Anyone who sees money is told when it isn't real.
  const mode = paystackMode();
  const banner =
    can(role, "expense.read") && (mode === "test" || mode === "simulated") ? (
      <TestModeBanner simulated={mode === "simulated"} />
    ) : undefined;
  return (
    <WorkspaceProvider me={{ id, name, email, role }} batches={batches} badges={badges}>
      <DashboardShell banner={banner}>{children}</DashboardShell>
    </WorkspaceProvider>
  );
}
