import { Suspense } from "react";
import type { Metadata } from "next";

import { AcceptForm } from "./_components/accept-form";
import { AuthHeading, AuthLink, AuthShell } from "@/components/auth";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { previewInvite } from "@/lib/users/service";

export const metadata: Metadata = { title: "Join Fowlex" };

export default function InvitePage({ searchParams }: PageProps<"/auth/invite">) {
  return (
    <AuthShell>
      <Suspense>
        <Invite searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

const PROBLEMS = {
  invalid: "This invite link doesn't work. It may have been cancelled, or replaced by a newer one.",
  used: "This invite has already been accepted. Sign in instead.",
  expired: "This invite has expired. Ask whoever invited you to send a new one.",
};

async function Invite({ searchParams }: Pick<PageProps<"/auth/invite">, "searchParams">) {
  const { token } = await searchParams;
  const invite =
    typeof token === "string" && token
      ? await previewInvite(token)
      : { ok: false as const, reason: "invalid" as const };

  if (!invite.ok)
    return (
      <>
        <AuthHeading title="This invite can't be used" description={PROBLEMS[invite.reason]} />
        <AuthLink href="/auth/login">Go to sign in</AuthLink>
      </>
    );

  return (
    <>
      <AuthHeading
        title={`Join ${invite.farmName}`}
        description={
          <>
            {invite.invitedBy ?? "Someone"} invited <strong className="text-fg">{invite.email}</strong> as{" "}
            {ROLE_LABELS[invite.role].toLowerCase()}. Set your name and a password to start.
          </>
        }
      />
      <AcceptForm token={token as string} email={invite.email} />
    </>
  );
}
