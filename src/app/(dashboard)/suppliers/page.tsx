import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return (
    <Planned
      title="Suppliers"
      description="Who you buy chicks, feed and drugs from, what you bought and what you owe."
      step="3.3"
    />
  );
}
