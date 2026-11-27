import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { BalanceBoard } from "./_components/balance-board";
import { PageSkeleton, RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/auth/permissions";
import { balanceSummary, listEntries } from "@/lib/balance/service";

export const metadata: Metadata = { title: "Paystack balance" };

export default function BalancePage() {
  return (
    <RequirePermission permission="finance.read">
      <PageHeader
        title="Paystack balance"
        description="Every naira in and out of the farm's Paystack balance, checked against Paystack's own record."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Balance />
      </Suspense>
    </RequirePermission>
  );
}

async function Balance() {
  const user = await requireUser();
  // The balance moves by the minute: always read it at request time.
  await connection();
  const [summary, entries] = await Promise.all([balanceSummary(user.farmId), listEntries(user.farmId)]);
  return (
    <BalanceBoard
      summary={summary}
      entries={entries}
      canSetTopUp={can(user.role, "settings.manage")}
      canAddTestMoney={can(user.role, "payout.send")}
    />
  );
}
