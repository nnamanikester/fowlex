import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage() {
  return <Planned title="Sales" description="Orders and deliveries of birds to customers." step="6.3" />;
}
