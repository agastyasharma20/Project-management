"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, ErrorState, Field, Input } from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <ErrorState title="Could not sign in" description={state.error} /> : null}

      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>

      <Field label="Password" htmlFor="password" required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      <SubmitButton />
    </form>
  );
}
