import { Suspense } from "react";
import type { Metadata } from "next";

import { LoginForm } from "./_components/login-form";
import { AuthShell } from "@/components/auth";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
