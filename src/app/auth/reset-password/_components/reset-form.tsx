"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";

import {
  AuthHeading,
  AuthLink,
  Field,
  FormAlert,
  PasswordInput,
  PasswordMeter,
  useFocusFirstError,
  visibleError,
} from "@/components/auth";
import { Button } from "@/components/ui/button";
import { type AuthError, authRequest } from "@/lib/auth/client";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/password";

const schema = yup.object({
  password: yup
    .string()
    .required("Choose a password.")
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
});

export function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [failure, setFailure] = React.useState<AuthError | null>(null);

  const form = useFormik({
    initialValues: { password: "" },
    validationSchema: schema,
    onSubmit: async ({ password }) => {
      setFailure(null);
      try {
        await authRequest("/api/auth/reset", "POST", { token, password });
        router.replace("/");
        router.refresh();
      } catch (e) {
        setFailure(e as AuthError);
      }
    },
  });
  useFocusFirstError(form, ["password"]);

  if (!token)
    return (
      <>
        <AuthHeading
          title="This link is incomplete"
          description="Open the link from your email again, or ask for a new one."
        />
        <AuthLink href="/auth/forgot-password">Ask for a new link</AuthLink>
      </>
    );

  return (
    <>
      <AuthHeading
        title="Choose a new password"
        description="It replaces your old one, and signs you out everywhere else."
      />
      <form noValidate onSubmit={form.handleSubmit} className="space-y-5">
        {failure && (
          <FormAlert title={failure.message}>
            {failure.code === "invalid_link" && <AuthLink href="/auth/forgot-password">Ask for a new link</AuthLink>}
          </FormAlert>
        )}
        <Field id="password" label="New password" error={visibleError(form, "password")}>
          {(a11y) => (
            <div className="space-y-2.5">
              <PasswordInput {...a11y} {...form.getFieldProps("password")} autoComplete="new-password" autoFocus />
              <PasswordMeter value={form.values.password} />
            </div>
          )}
        </Field>
        <Button type="submit" fullWidth loading={form.isSubmitting}>
          Save and sign in
        </Button>
      </form>
    </>
  );
}
