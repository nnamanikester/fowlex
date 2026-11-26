import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <Planned
      title="Customers"
      description="Restaurants, lounges and hotels you sell to: contacts, credit and statements."
      step="6.1"
    />
  );
}
