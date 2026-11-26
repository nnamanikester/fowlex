import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <Planned
      title="Reports"
      description="Profit and loss by batch, month and year, cash flow and exports."
      step="8.3"
      permission="finance.read"
    />
  );
}
