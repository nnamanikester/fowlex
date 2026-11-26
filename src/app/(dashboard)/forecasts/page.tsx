import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Forecasts" };

export default function ForecastsPage() {
  return (
    <Planned
      title="Forecasts"
      description="What the farm is likely to earn: batch projections, the trend and what-if plans."
      step="9.3"
    />
  );
}
