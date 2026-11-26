import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Daily log" };

export default function LogPage() {
  return (
    <Planned
      title="Daily log"
      description="Today's deaths, culls, feed and water for each batch, from a phone."
      step="2.3"
    />
  );
}
