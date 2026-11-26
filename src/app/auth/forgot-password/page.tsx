import { Suspense } from "react";
import type { Metadata } from "next";

import { ForgotForm } from "./_components/forgot-form";
import { AuthShell } from "@/components/auth";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <Suspense>
        <ForgotForm />
      </Suspense>
    </AuthShell>
  );
}
