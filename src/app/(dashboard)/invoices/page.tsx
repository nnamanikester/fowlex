import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <Planned
      title="Invoices"
      description="What customers owe, paid by Paystack link, transfer or cash."
      step="6.4"
      permission="invoice.read"
    />
  );
}
