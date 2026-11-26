"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import * as yup from "yup";

import { Field, FormAlert, PasswordInput, PasswordMeter, useFocusFirstError, visibleError } from "@/components/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AuthError, authRequest } from "@/lib/auth/client";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/password";

const FIELDS = ["name", "password"] as const;

const schema = yup.object({
  name: yup
    .string()
    .trim()
    .required("Enter your name.")
    .min(2, "Enter your name.")
    .max(80, "Use at most 80 characters."),
  password: yup
    .string()
    .required("Choose a password.")
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`),
});

export function AcceptForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [failure, setFailure] = React.useState<AuthError | null>(null);

  const form = useFormik({
    initialValues: { name: "", password: "" },
    validationSchema: schema,
    onSubmit: async (values) => {
      setFailure(null);
      try {
        const { home } = await authRequest<{ home: string }>("/api/auth/invite", "POST", {
          token,
          name: values.name.trim(),
          password: values.password,
        });
        router.replace(home);
        router.refresh();
      } catch (e) {
        setFailure(e as AuthError);
      }
    },
  });
  useFocusFirstError(form, FIELDS);

  return (
    <form noValidate onSubmit={form.handleSubmit} className="space-y-5">
      {failure && <FormAlert title={failure.message} />}
      {/* For password managers: the account this password belongs to. */}
      <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
      <Field id="name" label="Your name" error={visibleError(form, "name")}>
        {(a11y) => <Input {...a11y} {...form.getFieldProps("name")} autoComplete="name" autoFocus />}
      </Field>
      <Field id="password" label="Password" error={visibleError(form, "password")}>
        {(a11y) => (
          <div className="space-y-2.5">
            <PasswordInput {...a11y} {...form.getFieldProps("password")} autoComplete="new-password" />
            <PasswordMeter value={form.values.password} avoid={[form.values.name, email.split("@")[0]]} />
          </div>
        )}
      </Field>
      <Button type="submit" fullWidth loading={form.isSubmitting}>
        Join and sign in
      </Button>
    </form>
  );
}
