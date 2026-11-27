"use client";

import * as React from "react";
import { toast } from "sonner";

const ID = "connection";

/**
 * Says when the internet drops, and stays until it's back, so a save that can't go through is
 * never a surprise. Coming back online says so and clears it.
 */
export function ConnectionNotice() {
  React.useEffect(() => {
    const offline = () =>
      toast.warning("You're offline", {
        id: ID,
        description: "What you do now won't save until the internet is back.",
        duration: Infinity,
      });
    const online = () => toast.success("Back online", { id: ID, description: undefined, duration: 3000 });
    if (!navigator.onLine) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);
  return null;
}
