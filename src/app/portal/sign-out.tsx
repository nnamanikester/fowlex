"use client";

import { useSignOut } from "@/components/shell/use-sign-out";
import { Button } from "@/components/ui/button";

export function PortalSignOut() {
  const signOut = useSignOut();
  return (
    <Button variant="secondary" onClick={() => void signOut()}>
      Sign out
    </Button>
  );
}
