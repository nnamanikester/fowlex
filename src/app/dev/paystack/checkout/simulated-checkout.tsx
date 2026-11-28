"use client";

import * as React from "react";
import { FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/auth/client";
import { formatNaira } from "@/lib/money";

type Charge = { reference: string; amount: number; paid: boolean; callback: string };

/** Pays a simulated checkout with test money and goes back, as Paystack's page would. */
export function SimulatedCheckout({ reference }: { reference: string }) {
  const [charge, setCharge] = React.useState<Charge | null>(null);
  const [paying, setPaying] = React.useState(false);
  React.useEffect(() => {
    void apiRequest<Charge>(`/api/dev/paystack/charge?reference=${encodeURIComponent(reference)}`, "GET")
      .then(setCharge)
      .catch(() => setCharge(null));
  }, [reference]);
  const back = (paid: boolean) => {
    if (!charge) return;
    const url = new URL(charge.callback);
    if (paid) url.searchParams.set("reference", charge.reference);
    window.location.assign(url.toString());
  };
  return (
    <main className="grid min-h-dvh place-items-center bg-surface-subtle px-4">
      <div className="w-full max-w-sm space-y-5 rounded-xl border border-line bg-surface p-6 shadow-card">
        <p className="flex items-center gap-2 text-sm font-semibold text-warning-fg">
          <FlaskConical className="size-4" aria-hidden /> Paystack test checkout
        </p>
        {charge ? (
          <>
            <div className="space-y-1">
              <p className="text-sm text-fg-muted">Pay</p>
              <p className="num text-3xl font-extrabold text-fg-heading">{formatNaira(charge.amount)}</p>
            </div>
            <Button
              size="lg"
              fullWidth
              loading={paying}
              onClick={() => {
                setPaying(true);
                void apiRequest("/api/dev/paystack/pay", "POST", { reference }).then(() => back(true));
              }}
            >
              Pay with test card
            </Button>
            <Button variant="ghost" fullWidth disabled={paying} onClick={() => back(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <p className="text-sm text-fg-muted">Loading the payment…</p>
        )}
      </div>
    </main>
  );
}
