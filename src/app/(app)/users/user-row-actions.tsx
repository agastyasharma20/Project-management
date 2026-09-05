"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "@/components/ui";
import { resetPasswordAction, toggleUserAction, type UserState } from "./actions";

const IDLE: UserState = { status: "idle" };

export function UserRowActions({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [toggleState, toggle] = useActionState(toggleUserAction, IDLE);
  const [resetState, reset] = useActionState(resetPasswordAction, IDLE);
  const [showReset, setShowReset] = useState(false);

  const message = toggleState.message ?? resetState.message;
  const failed = toggleState.status === "error" || resetState.status === "error";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-1">
        <form action={toggle}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="active" value={isActive ? "false" : "true"} />
          <Button type="submit" size="sm" variant={isActive ? "ghost" : "secondary"}>
            {isActive ? "Disable" : "Enable"}
          </Button>
        </form>
        <Button size="sm" variant="ghost" onClick={() => setShowReset((v) => !v)}>
          Reset password
        </Button>
      </div>

      {showReset ? (
        <form action={reset} className="flex items-center gap-1">
          <input type="hidden" name="userId" value={userId} />
          <label htmlFor={`pw-${userId}`} className="sr-only">
            New password
          </label>
          <Input
            id={`pw-${userId}`}
            name="password"
            type="text"
            minLength={8}
            required
            placeholder="New password"
            className="h-8 w-40 text-[12px]"
          />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      ) : null}

      {message ? (
        <p className={failed ? "text-[11px] text-[var(--color-danger)]" : "text-[11px] text-[var(--color-success)]"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
