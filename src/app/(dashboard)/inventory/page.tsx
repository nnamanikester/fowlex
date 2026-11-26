import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <Planned
      title="Inventory"
      description="Feed, drugs and equipment on hand, what they cost and which batch used them."
      step="3.1"
    />
  );
}
