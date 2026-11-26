import { Hammer } from "lucide-react";

import { RequirePermission } from "./require-permission";
import { EmptyState, PageHeader, Panel } from "@/components/kit";
import type { Permission } from "@/lib/auth/permissions";

/**
 * A page that is in the nav but not built yet: what it will do, and the plan step that builds it.
 * Guarded by the same permission the real page will need.
 */
export function Planned({
  title,
  description,
  step,
  permission,
}: {
  title: string;
  description: string;
  step: string;
  permission: Permission;
}) {
  return (
    <RequirePermission permission={permission}>
      <PageHeader title={title} description={description} />
      <Panel>
        <EmptyState
          icon={<Hammer />}
          title="Not built yet"
          description={`This page arrives in step ${step} of the build plan.`}
        />
      </Panel>
    </RequirePermission>
  );
}
