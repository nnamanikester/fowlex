"use client";

import * as React from "react";

import { can as roleCan, type Permission, type Role } from "@/lib/auth/permissions";
import { useStored } from "@/lib/use-stored";

export type Me = { id: string; name: string; email: string; role: Role };

/** What the shell needs to know about a batch: enough for the switcher and the breadcrumb. */
export type BatchSummary = {
  id: string;
  code: string;
  house: string;
  status: "active" | "selling";
  /** Days since placement. */
  day: number;
  liveBirds: number;
};

type Workspace = {
  me: Me;
  can: (permission: Permission) => boolean;
  /** Batches on the farm now (active or selling), newest first. */
  batches: BatchSummary[];
  /** The batch the farm pages focus on; null when there are none. */
  batch: BatchSummary | null;
  setBatch: (id: string) => void;
};

const WorkspaceContext = React.createContext<Workspace | null>(null);

/** Who is signed in, what they can do, and the batch the pages look at (remembered per browser). */
export function WorkspaceProvider({
  me,
  batches,
  children,
}: {
  me: Me;
  batches: BatchSummary[];
  children: React.ReactNode;
}) {
  const [chosen, setChosen] = useStored("fowlex_batch", "");
  const batch = batches.find((b) => b.id === chosen) ?? batches[0] ?? null;
  const value = React.useMemo<Workspace>(
    () => ({
      me,
      can: (permission) => roleCan(me.role, permission),
      batches,
      batch,
      setBatch: setChosen,
    }),
    [me, batches, batch, setChosen],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const workspace = React.useContext(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return workspace;
}
