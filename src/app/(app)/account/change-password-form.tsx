"use client";

import { useActionState } from "react";
import { Button, ErrorState, Field, Input, SuccessNote } from "@/components/ui";
import { changePasswordAction, type PasswordState } from "./actions";

export function ChangePasswordForm() {
  const [state, action] = useActionState<PasswordState, FormData>(changePasswordAction, { status: "idle" });

  return (
    <form action={action} className="space-y-3">
      {state.status === "error" ? <ErrorState title="Not changed" description={state.message} /> : null}
      {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}

      <Field label="Current password" htmlFor="currentPassword" required>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="newPassword" required hint="At least 8 characters with a letter and a number.">
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" required>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>

      <Button type="submit">Update password</Button>
    </form>
  );
}
