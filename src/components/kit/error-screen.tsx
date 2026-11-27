"use client";

import * as React from "react";
import { CloudOff, RotateCw } from "lucide-react";

import { EmptyState } from "./empty-state";
import { Button, LinkButton } from "@/components/ui/button";

/**
 * A page that couldn't load: what happened in plain words, a way to try again and a way home.
 * Offline gets its own words, since that's the usual reason on a farm.
 */
export function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  const [trying, setTrying] = React.useState(false);
  React.useEffect(() => {
    console.warn(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div role="alert" className="mx-auto max-w-md">
      <EmptyState
        icon={<CloudOff />}
        title={offline ? "You're offline" : "This page didn't load"}
        description={
          offline
            ? "Fowlex needs the internet to show this. It loads again once you're back online."
            : "Something went wrong on our side. Try again, and if it keeps happening, go back home."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              loading={trying}
              onClick={() => {
                setTrying(true);
                React.startTransition(() => retry());
                setTimeout(() => setTrying(false), 1500);
              }}
            >
              <RotateCw /> Try again
            </Button>
            <LinkButton href="/" variant="secondary">
              Go home
            </LinkButton>
          </div>
        }
      />
    </div>
  );
}
