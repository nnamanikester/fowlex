import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { PayView } from "./_components/pay-view";
import { payPage, returnFromCheckout } from "@/lib/collections/service";
import { paystackMode } from "@/lib/paystack/client";

export const metadata: Metadata = { title: "Pay your invoice", robots: { index: false } };

/**
 * An invoice's pay link: the bill, what's left, and paying it by card, bank app, USSD or
 * transfer. No sign-in. Coming back from Paystack's checkout, the payment is confirmed first.
 */
export default function PayLinkPage({ params, searchParams }: PageProps<"/pay/[token]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-charcoal" />}>
      <Pay params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Pay({ params, searchParams }: Pick<PageProps<"/pay/[token]">, "params" | "searchParams">) {
  await connection();
  const { token } = await params;
  const { reference } = await searchParams;
  // Back from checkout: Paystack says whether the money came in, never the address bar.
  const returned = typeof reference === "string" ? await returnFromCheckout(token, reference) : null;
  const data = await payPage(token);
  if (!data)
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas px-4 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-2xl font-bold text-fg-heading">This pay link doesn&apos;t work</h1>
          <p className="text-fg-muted">Ask the farm to send you a new one.</p>
        </div>
      </main>
    );
  return <PayView data={data} returned={returned} simulated={paystackMode() === "simulated"} />;
}
