"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";

import { AuthHeading, AuthLink, Field, FormAlert, useFocusFirstError, visibleError } from "@/components/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AuthError, authRequest } from "@/lib/auth/client";

const schema = yup.object({
  email: yup.string().trim().required("Enter your email.").email("Enter a valid email, like ada@fowlex.com."),
});

export function ForgotForm() {
  const params = useSearchParams();
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<AuthError | null>(null);

  const form = useFormik({
    initialValues: { email: params.get("email") ?? "" },
    validationSchema: schema,
    onSubmit: async ({ email }) => {
      setFailure(null);
      try {
        await authRequest("/api/auth/forgot", "POST", { email: email.trim() });
        setSentTo(email.trim());
      } catch (e) {
        setFailure(e as AuthError);
      }
    },
  });
  useFocusFirstError(form, ["email"]);

  if (sentTo)
    return (
      <>
        <AuthHeading
          title="Check your email"
          description={
            <>
              If <strong className="text-fg">{sentTo}</strong> has a Fowlex account, we&apos;ve sent it a link to choose
              a new password. The link works once, for an hour.
            </>
          }
        />
        <p className="text-sm text-fg-muted">
          Nothing after a few minutes? Check spam, or <AuthLink href="/auth/forgot-password">try again</AuthLink>.
        </p>
        <p className="mt-6 text-sm">
          <AuthLink href="/auth/login">Back to sign in</AuthLink>
        </p>
      </>
    );

  return (
    <>
      <AuthHeading
        title="Reset your password"
        description="Enter your email and we'll send you a link to choose a new one."
      />
      <form noValidate onSubmit={form.handleSubmit} className="space-y-5">
        {failure && <FormAlert title={failure.message} />}
        <Field id="email" label="Email" error={visibleError(form, "email")}>
          {(a11y) => (
            <Input
              {...a11y}
              {...form.getFieldProps("email")}
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              placeholder="ada@fowlex.com"
            />
          )}
        </Field>
        <Button type="submit" fullWidth loading={form.isSubmitting}>
          Send the link
        </Button>
        <p className="text-sm">
          <AuthLink href="/auth/login">Back to sign in</AuthLink>
        </p>
      </form>
    </>
  );
}
