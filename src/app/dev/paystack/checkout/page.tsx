import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";

import { SimulatedCheckout } from "./simulated-checkout";
import { paystackMode } from "@/lib/paystack/client";

/** The simulator's stand-in for Paystack's checkout page. Only with the simulator. */
export default function DevCheckoutPage({ searchParams }: PageProps<"/dev/paystack/checkout">) {
  return (
    <Suspense>
      <Checkout searchParams={searchParams} />
    </Suspense>
  );
}

async function Checkout({ searchParams }: Pick<PageProps<"/dev/paystack/checkout">, "searchParams">) {
  await connection();
  if (paystackMode() !== "simulated") notFound();
  const { reference } = await searchParams;
  return <SimulatedCheckout reference={typeof reference === "string" ? reference : ""} />;
}
