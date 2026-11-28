import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { OrderPage } from "./_components/order-page";
import { today } from "@/lib/dates";
import { shopOffer } from "@/lib/shop/service";

export async function generateMetadata({ params }: PageProps<"/order/[slug]">): Promise<Metadata> {
  await connection();
  const offer = await shopOffer((await params).slug);
  return offer
    ? {
        title: `Order broilers from ${offer.farm.name}`,
        description: `Fresh broilers from ${offer.farm.name}: see what's ready and order in a minute.`,
      }
    : { title: "Order page" };
}

/** A farm's public order page: what's ready, and ordering it in one go. No sign-in. */
export default function PublicOrderPage({ params }: PageProps<"/order/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-charcoal" />}>
      <Offer params={params} />
    </Suspense>
  );
}

async function Offer({ params }: Pick<PageProps<"/order/[slug]">, "params">) {
  // Birds sell by the hour: always what's there now.
  await connection();
  const { slug } = await params;
  const offer = await shopOffer(slug);
  if (!offer)
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas px-4 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-2xl font-bold text-fg-heading">This page isn&apos;t taking orders right now</h1>
          <p className="text-fg-muted">Call the farm to order, or try this link again later.</p>
        </div>
      </main>
    );
  return <OrderPage offer={offer} today={today()} />;
}
