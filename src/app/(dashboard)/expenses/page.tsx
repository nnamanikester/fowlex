import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage() {
  return (
    <Planned
      title="Expenses"
      description="Every naira spent, with a category, a receipt and, where it belongs, a batch."
      step="4.2"
    />
  );
}
