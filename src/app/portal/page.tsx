import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PortalSignOut } from "./sign-out";
import { AuthHeading, AuthShell } from "@/components/auth";
import { requireUser } from "@/lib/auth/current-user";
import { homeFor } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Customer portal" };

/** Where customers land. Their invoices, orders and statements arrive in step 6.7. */
export default function PortalPage() {
  return (
    <AuthShell>
      <Suspense>
        <Portal />
      </Suspense>
    </AuthShell>
  );
}

async function Portal() {
  const user = await requireUser();
  if (user.role !== "customer") redirect(homeFor(user.role));
  return (
    <>
      <AuthHeading
        title={`Welcome, ${user.name}`}
        description="Your invoices, orders and statements from Fowlex Farms will be here soon."
      />
      <PortalSignOut />
    </>
  );
}
