import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/kit/empty-state";
import { LinkButton } from "@/components/ui/button";

/** A batch, person or item that isn't there any more: say so inside the shell, with a way home. */
export default function DashboardNotFound() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="We couldn't find that"
      description="It may have been removed, or the link is wrong."
      action={<LinkButton href="/">Go home</LinkButton>}
    />
  );
}
