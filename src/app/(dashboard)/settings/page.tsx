import type { Metadata } from "next";

import { Planned } from "../_components/planned";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Planned
      title="Settings"
      description="Business details, invoice numbering, approval limits, houses and users."
      step="1.11"
    />
  );
}
