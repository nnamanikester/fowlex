"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";

import { TransferAccount } from "@/components/payments/transfer-account";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth/client";
import type { CollectionView } from "@/lib/collections/service";
import { useAction } from "@/lib/use-action";

/** Pay now: an account for this invoice to transfer into, which turns to Paid when the money lands. */
export function PayNow({ invoiceId, simulated }: { invoiceId: string; simulated: boolean }) {
  const router = useRouter();
  const action = useAction();
  const [account, setAccount] = React.useState<CollectionView | null>(null);
  const start = () =>
    void action.run(() => apiRequest<CollectionView>(`/api/portal/invoices/${invoiceId}/collect`, "POST"), {
      onSuccess: setAccount,
    });
  if (account)
    return (
      <TransferAccount
        collection={account}
        checkUrl={(id) => `/api/portal/collections/${id}`}
        simulated={simulated}
        onPaid={() => router.refresh()}
        onNew={start}
      />
    );
  return (
    <div className="space-y-2">
      <ActionFeedback action={action} />
      <Button fullWidth size="lg" loading={action.busy} onClick={start}>
        <CreditCard /> Pay now by transfer
      </Button>
    </div>
  );
}
