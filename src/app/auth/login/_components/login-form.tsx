"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";

import { AuthHeading, Field, FormAlert, PasswordInput, useFocusFirstError, visibleError } from "@/components/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AuthError, authRequest } from "@/lib/auth/client";
import { safeRedirect } from "@/lib/auth/paths";

const FIELDS = ["email", "password"] as const;
type FieldName = (typeof FIELDS)[number];

const schema = yup.object({
  email: yup.string().trim().required("Enter your email.").email("Enter a valid email, like ada@fowlex.com."),
  password: yup.string().required("Enter your password."),
});

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const form = useFormik({
    initialValues: { email: params.get("email") ?? "", password: "" },
    validationSchema: schema,
    onSubmit: async (values) => {
      setFailure(null);
      try {
        await authRequest("/api/auth/login", "POST", { email: values.email.trim(), password: values.password });
        // Server components render afresh for the new session.
        router.replace(safeRedirect(params.get("redirect")));
        router.refresh();
      } catch (e) {
        setFailure(e as AuthError);
        // Keep what they typed, selected: one keystroke replaces it, and a near-miss can be fixed.
        passwordRef.current?.select();
      }
    },
  });
  useFocusFirstError(form, FIELDS);

  const error = (name: FieldName) => visibleError(form, name);
  const forgotHref = `/auth/forgot-password${form.values.email ? `?email=${encodeURIComponent(form.values.email.trim())}` : ""}`;

  return (
    <>
      <AuthHeading title="Sign in" description="Welcome back. Sign in to run the farm." />
      <form noValidate onSubmit={form.handleSubmit} className="space-y-5">
        {params.get("reason") === "expired" && !failure && (
          <FormAlert tone="info" title="Your session ended.">
            Sign in again to pick up where you left off.
          </FormAlert>
        )}
        {params.get("reason") === "signed_out" && !failure && <FormAlert tone="success" title="You've signed out." />}
        {failure && (
          <FormAlert title={failure.message}>
            {(failure.code === "invalid_credentials" || failure.code === "locked") && (
              <p>
                Forgot it? <Link href={forgotHref}>Reset your password</Link>
              </p>
            )}
          </FormAlert>
        )}

        <Field id="email" label="Email" error={error("email")}>
          {(a11y) => (
            <Input
              {...a11y}
              {...form.getFieldProps("email")}
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus={!form.values.email}
              placeholder="ada@fowlex.com"
            />
          )}
        </Field>

        <Field
          id="password"
          label="Password"
          error={error("password")}
          action={
            <Link
              href={forgotHref}
              className="focus-ring rounded-sm text-xs text-fg-muted hover:text-fg hover:underline"
            >
              Forgot password?
            </Link>
          }
        >
          {(a11y) => (
            <PasswordInput
              {...a11y}
              {...form.getFieldProps("password")}
              ref={passwordRef}
              autoComplete="current-password"
              autoFocus={Boolean(form.values.email)}
            />
          )}
        </Field>

        <Button type="submit" fullWidth loading={form.isSubmitting}>
          {form.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </>
  );
}
