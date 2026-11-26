import { Suspense } from "react";
import type { Metadata } from "next";

import { ResetForm } from "./_components/reset-form";
import { AuthShell } from "@/components/auth";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
