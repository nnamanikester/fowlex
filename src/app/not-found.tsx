import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/kit/empty-state";
import { LinkButton } from "@/components/ui/button";

/** A link to something that isn't there (removed, or mistyped). */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <EmptyState
        icon={<SearchX />}
        title="We couldn't find that page"
        description="It may have been removed, or the link is wrong."
        action={<LinkButton href="/">Go home</LinkButton>}
      />
    </main>
  );
}
