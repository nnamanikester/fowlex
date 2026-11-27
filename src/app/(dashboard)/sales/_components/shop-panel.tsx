"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Globe, MessageCircle, Share2 } from "lucide-react";

import { Field } from "@/components/auth";
import { CopyButton, Panel } from "@/components/kit";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { apiRequest } from "@/lib/auth/client";
import type { ShopSettings } from "@/lib/shop/service";
import { useAction } from "@/lib/use-action";

/**
 * The farm's order link: turn it on with a price, then copy or share it (WhatsApp first: that's
 * where buyers are). Customers who open it see what's ready and order without signing in.
 */
export function ShopPanel({ shop, canWrite }: { shop: ShopSettings; canWrite: boolean }) {
  const router = useRouter();
  const action = useAction();
  const [price, setPrice] = React.useState<number | null>(shop.pricePerKgKobo);
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser
    setOrigin(window.location.origin);
  }, []);
  const link = shop.slug ? `${origin}/order/${shop.slug}` : "";
  const save = (change: Record<string, unknown>, message: string, key: string) =>
    void action.run(() => apiRequest<ShopSettings>("/api/shop", "PATCH", change), {
      key,
      success: message,
      onSuccess: () => router.refresh(),
    });

  if (!shop.enabled)
    return (
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="flex items-center gap-2 text-base font-bold text-fg-heading">
              <Globe className="size-4 text-fg-muted" aria-hidden /> Let customers order online
            </h2>
            <p className="text-sm text-fg-muted">
              A link you share on WhatsApp: buyers see the birds you have ready and order in a minute, no account
              needed. You get an email for each order.
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap items-end gap-2">
              <Field id="shopPrice" label="Your price per kg" error={action.fieldError("pricePerKgKobo")}>
                {(a11y) => <MoneyInput {...a11y} value={price} onChange={setPrice} placeholder="3,200.00" />}
              </Field>
              <Button
                loading={action.isPending("on")}
                disabled={!price}
                reason="Enter your price per kg: customers see it."
                onClick={() => save({ enabled: true, pricePerKgKobo: price }, "Your order page is on.", "on")}
              >
                Turn on my order page
              </Button>
            </div>
          )}
        </div>
        <ActionFeedback action={action} className="mt-3" />
      </Panel>
    );

  const share = async () => {
    const text = `Order fresh broilers from us here: ${link}`;
    if (navigator.share) await navigator.share({ title: "Order broilers", text, url: link }).catch(() => undefined);
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  return (
    <Panel
      title="Your order link"
      description="Share it with buyers: they see what's ready and order without an account."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-subtle px-3 py-2.5">
          <Globe className="size-4 shrink-0 text-fg-muted" aria-hidden />
          <span className="num min-w-0 flex-1 truncate text-sm font-semibold text-fg">{link || "…"}</span>
          <CopyButton value={link} label="Copy the order link" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button onClick={() => void share()}>
            <Share2 /> Share
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Order fresh broilers from us here: ${link}`)}`}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-fg"
          >
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="focus-ring col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-brand-fg sm:col-span-1"
          >
            <ExternalLink className="size-4" aria-hidden /> See it as customers do
          </a>
        </div>
        {canWrite && (
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="flex flex-wrap items-end gap-2">
              <Field id="shopPrice" label="Price per kg on the page" error={action.fieldError("pricePerKgKobo")}>
                {(a11y) => <MoneyInput {...a11y} value={price} onChange={setPrice} />}
              </Field>
              {price !== shop.pricePerKgKobo && (
                <Button
                  variant="secondary"
                  loading={action.isPending("price")}
                  disabled={!price}
                  reason="Enter a price."
                  onClick={() => save({ pricePerKgKobo: price }, "Price saved: the page shows it now.", "price")}
                >
                  Save price
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-fg">
                <ToggleSwitch
                  ariaLabel="We deliver"
                  checked={shop.delivers}
                  disabled={action.busy}
                  onChange={(on) =>
                    save(
                      { delivers: on },
                      on ? "Customers can ask for delivery." : "Customers collect from the farm.",
                      "delivers",
                    )
                  }
                />
                We deliver
              </label>
              <Button
                variant="ghost"
                size="sm"
                loading={action.isPending("off")}
                disabled={action.busy}
                onClick={() => save({ enabled: false }, "Your order page is off: the link says so.", "off")}
              >
                Turn it off
              </Button>
            </div>
          </div>
        )}
        <ActionFeedback action={action} />
      </div>
    </Panel>
  );
}
