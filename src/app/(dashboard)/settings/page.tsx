import type { Metadata } from "next";
import { Hammer } from "lucide-react";

import { EmptyState, Panel } from "@/components/kit";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Panel>
      <EmptyState
        icon={<Hammer />}
        title="Not built yet"
        description="Business details, invoice numbering and approval limits arrive in step 1.11 of the build plan."
      />
    </Panel>
  );
}
