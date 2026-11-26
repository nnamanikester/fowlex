"use client";

import { useRouter } from "next/navigation";

import { authRequest } from "@/lib/auth/client";

/** Signs out of this browser and lands on the sign-in page. */
export function useSignOut() {
  const router = useRouter();
  return async () => {
    await authRequest("/api/auth/session", "DELETE").catch(() => undefined);
    router.replace("/auth/login?reason=signed_out");
    router.refresh();
  };
}
