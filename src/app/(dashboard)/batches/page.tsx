import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Batches" };

export default function BatchesPage() {
  return (
    <Planned
      title="Batches"
      description="Every group of birds from day-old chicks to sale: counts, growth, feed and health."
      step="2.2"
      permission="batch.read"
    />
  );
}
