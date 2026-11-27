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
  children,
}: {
  title: string;
  description: string;
  step: string;
  permission: Permission;
  /** What's already built here, shown above the placeholder. */
  children?: React.ReactNode;
}) {
  return (
    <RequirePermission permission={permission}>
      <PageHeader title={title} description={description} />
      {children}
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
