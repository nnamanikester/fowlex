import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Contracts" };

export default function ContractsPage() {
  return (
    <Planned
      title="Contracts"
      description="The terms agreed with each customer: price, volumes, delivery and payment."
      step="6.2"
    />
  );
}
