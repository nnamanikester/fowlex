"use client";

import { ErrorScreen } from "@/components/kit/error-screen";

/** A page in the shell that failed to load: the shell stays, with a way to try again. */
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
