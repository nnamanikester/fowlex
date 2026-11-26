import { Suspense } from "react";
import { ShieldX } from "lucide-react";

import { EmptyState, PageHeader, Panel } from "@/components/kit";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/current-user";
import { can, homeFor, type Permission, ROLE_LABELS } from "@/lib/auth/permissions";

/**
 * Shows `children` only to roles with `permission`; anyone else gets a page saying so. The server
 * decides, so hiding a link is never the only thing keeping someone out. Reads the session, so it
 * streams in behind its own Suspense boundary.
 */
export function RequirePermission(props: { permission: Permission; children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Gate {...props} />
    </Suspense>
  );
}

/** A page's place while it loads: title, a line, a panel. */
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

async function Gate({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const user = await requireUser();
  if (can(user.role, permission)) return <>{children}</>;
  return (
    <>
      <PageHeader title="No access" />
      <Panel>
        <EmptyState
          icon={<ShieldX />}
          title="Your role can't open this page"
          description={`You're signed in as ${ROLE_LABELS[user.role].toLowerCase()}. If you need this page, ask a partner to change your role.`}
          action={
            <LinkButton href={homeFor(user.role)} size="sm" variant="secondary">
              Go to your home page
            </LinkButton>
          }
        />
      </Panel>
    </>
  );
}
