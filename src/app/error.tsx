"use client";

import { ErrorScreen } from "@/components/kit/error-screen";

/** Any other page that failed to load (sign in, the portal). */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <ErrorScreen error={error} retry={retry} />
    </main>
  );
}
