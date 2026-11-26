import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Payroll" };

export default function PayrollPage() {
  return (
    <Planned
      title="Payroll"
      description="Monthly payroll runs and payslips, paid through Paystack."
      step="5.4"
      permission="payroll.read"
    />
  );
}
