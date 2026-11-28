"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Landmark } from "lucide-react";

import { TransferAccount } from "@/components/payments/transfer-account";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { apiRequest } from "@/lib/auth/client";
import type { CollectionView } from "@/lib/collections/service";
import { useAction } from "@/lib/use-action";

/** Pay now: an account for this invoice to transfer into, which turns to Paid when the money lands. */
export function PayNow({
  invoiceId,
  payUrl = null,
  simulated,
}: {
  invoiceId: string;
  /** The invoice's pay link: card, bank app or USSD through Paystack. */
  payUrl?: string | null;
  simulated: boolean;
}) {
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
      {payUrl && (
        <a href={payUrl} className={buttonClasses({ size: "lg", fullWidth: true })}>
          <CreditCard /> Pay by card, bank app or USSD
        </a>
      )}
      <Button fullWidth size="lg" variant={payUrl ? "secondary" : "primary"} loading={action.busy} onClick={start}>
        <Landmark /> Pay now by transfer
      </Button>
    </div>
  );
}
