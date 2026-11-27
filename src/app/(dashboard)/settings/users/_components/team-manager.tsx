"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Crown, MailPlus, MoreHorizontal, Power, RotateCw, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { Field, FormAlert } from "@/components/auth";
import { ConfirmDialog, Panel } from "@/components/kit";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Modal } from "@/components/ui/modal";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { useAction } from "@/lib/use-action";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import type { Team } from "@/lib/users/service";
import { cn } from "@/lib/utils";

type TeamRole = Team["users"][number]["role"];
type Member = Team["users"][number];

const ROLE_HELP: Record<TeamRole, string> = {
  owner: "Everything, including payouts, approvals, payroll runs and settings.",
  manager: "Runs the farm day to day: batches, stock, sales, expenses and payroll drafts.",
  staff: "Logs the daily numbers and sees batches and stock. No money.",
};
const ROLE_ORDER: TeamRole[] = ["owner", "manager", "staff"];

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const when = (iso: string | null) => (iso ? DATE.format(new Date(iso)) : "Never");

/** Who can sign in, what each can do, and who's still to join. Owners only. */
export function TeamManager({ team }: { team: Team }) {
  const router = useRouter();
  const [inviting, setInviting] = React.useState(false);
  const [turningOff, setTurningOff] = React.useState<Member | null>(null);

  const action = useAction();
  const run = (fn: () => Promise<unknown>, success: string) =>
    action.run(fn, { progress: "Saving…", success, onSuccess: () => router.refresh() });

  const setMember = (member: Member, change: { role?: TeamRole; status?: "active" | "disabled" }, success: string) =>
    run(() => apiRequest(`/api/users/${member.id}`, "PATCH", change), success);

  return (
    <div className="space-y-6">
      <Panel
        title="People"
        description="Everyone who can sign in to Fowlex Farms."
        actions={
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus /> Invite someone
          </Button>
        }
        flush
      >
        <ul className="divide-y divide-line">
          {team.users.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-5 py-3.5">
              <Avatar name={member.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold text-fg">
                  <span className="truncate">{member.name}</span>
                  {member.isYou && <span className="text-xs font-medium text-fg-subtle">You</span>}
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  {member.email} · last signed in {when(member.lastLoginAt)}
                </span>
              </span>
              {member.status === "disabled" && <Badge>Turned off</Badge>}
              <Badge tone={member.role === "owner" ? "brand" : "neutral"}>
                {member.role === "owner" && <Crown className="size-3" aria-hidden />}
                {ROLE_LABELS[member.role]}
              </Badge>
              {member.isYou ? (
                <span className="size-9" aria-hidden />
              ) : (
                <Menu
                  label={`Manage ${member.name}`}
                  align="end"
                  trigger={({ ref, ...props }) => (
                    <Button ref={ref} variant="ghost" size="icon" aria-label={`Manage ${member.name}`} {...props}>
                      <MoreHorizontal />
                    </Button>
                  )}
                >
                  <MenuLabel>Role</MenuLabel>
                  {ROLE_ORDER.filter((r) => r !== member.role).map((role) => (
                    <MenuItem
                      key={role}
                      onSelect={() =>
                        void setMember(member, { role }, `${member.name} is now ${ROLE_LABELS[role].toLowerCase()}.`)
                      }
                    >
                      Make {ROLE_LABELS[role].toLowerCase()}
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                  {member.status === "active" ? (
                    <MenuItem icon={<Power />} tone="danger" onSelect={() => setTurningOff(member)}>
                      Turn off account
                    </MenuItem>
                  ) : (
                    <MenuItem
                      icon={<Power />}
                      onSelect={() => void setMember(member, { status: "active" }, `${member.name} can sign in again.`)}
                    >
                      Turn account back on
                    </MenuItem>
                  )}
                </Menu>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {team.invites.length > 0 && (
        <Panel title="Waiting to join" description="Invite links work once, for seven days." flush>
          <ul className="divide-y divide-line">
            {team.invites.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-subtle text-fg-subtle">
                  <MailPlus className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{invite.email}</span>
                  <span className="block truncate text-xs text-fg-subtle">
                    Sent {when(invite.sentAt)}
                    {invite.invitedBy && <> by {invite.invitedBy}</>}
                  </span>
                </span>
                {invite.expired && <Badge tone="warning">Expired</Badge>}
                <Badge>{ROLE_LABELS[invite.role]}</Badge>
                <Menu
                  label={`Manage invite for ${invite.email}`}
                  align="end"
                  trigger={({ ref, ...props }) => (
                    <Button
                      ref={ref}
                      variant="ghost"
                      size="icon"
                      aria-label={`Manage invite for ${invite.email}`}
                      {...props}
                    >
                      <MoreHorizontal />
                    </Button>
                  )}
                >
                  <MenuItem
                    icon={<RotateCw />}
                    onSelect={() =>
                      void run(
                        () => apiRequest(`/api/users/invites/${invite.id}/resend`, "POST"),
                        `A new link is on its way to ${invite.email}.`,
                      )
                    }
                  >
                    Resend invite
                  </MenuItem>
                  <MenuItem
                    icon={<X />}
                    tone="danger"
                    onSelect={() =>
                      void run(
                        () => apiRequest(`/api/users/invites/${invite.id}`, "DELETE"),
                        `The invite for ${invite.email} is cancelled.`,
                      )
                    }
                  >
                    Cancel invite
                  </MenuItem>
                </Menu>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onSent={(email) => {
          setInviting(false);
          toast.success(`Invite sent to ${email}.`);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={turningOff !== null}
        onOpenChange={(open) => !open && setTurningOff(null)}
        title={`Turn off ${turningOff?.name ?? ""}'s account?`}
        description="They're signed out everywhere at once and can't sign in until you turn it back on. Nothing they recorded is lost."
        confirmLabel="Turn off account"
        onConfirm={async () => {
          if (turningOff)
            await setMember(turningOff, { status: "disabled" }, `${turningOff.name} can no longer sign in.`);
        }}
      />
    </div>
  );
}

function InviteDialog({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<TeamRole>("staff");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);

  // Each opening starts empty: reset while rendering, not in an effect.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmail("");
      setRole("staff");
      setFailure(null);
    }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Invite someone">
      <form
        noValidate
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setFailure(null);
          try {
            await apiRequest("/api/users/invites", "POST", { email: email.trim(), role });
            onSent(email.trim());
          } catch (error) {
            setFailure(error as AuthError);
          } finally {
            setBusy(false);
          }
        }}
      >
        {failure && <FormAlert title={failure.message} />}
        <Field id="invite-email" label="Email" hint="We'll email them a link to set their name and password.">
          {(a11y) => (
            <Input
              {...a11y}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="musa@fowlex.com"
            />
          )}
        </Field>
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-semibold text-fg">Role</legend>
          {ROLE_ORDER.map((r) => (
            <label
              key={r}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors focus-within:ring-4 focus-within:ring-brand/15",
                role === r ? "border-brand bg-brand-subtle" : "border-line hover:border-line-strong",
              )}
            >
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="mt-1 accent-[rgb(var(--brand))]"
              />
              <span>
                <span className="block text-sm font-semibold text-fg">{ROLE_LABELS[r]}</span>
                <span className="block text-xs text-fg-muted">{ROLE_HELP[r]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!email.trim()} reason="Type their email first.">
            Send invite
          </Button>
        </div>
      </form>
    </Modal>
  );
}
