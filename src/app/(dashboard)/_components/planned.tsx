import { Hammer } from "lucide-react";

import { EmptyState, PageHeader, Panel } from "@/components/kit";

/** A page that is in the nav but not built yet: what it will do, and the plan step that builds it. */
export function Planned({ title, description, step }: { title: string; description: string; step: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Panel>
        <EmptyState
          icon={<Hammer />}
          title="Not built yet"
          description={`This page arrives in step ${step} of the build plan.`}
        />
      </Panel>
    </>
  );
}
