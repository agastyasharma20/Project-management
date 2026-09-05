"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Select, SuccessNote } from "@/components/ui";
import { makeJudgeAction, type JudgeState } from "./actions";

export function JudgeManager({ faculty }: { faculty: { value: string; label: string }[] }) {
  const [state, action] = useActionState<JudgeState, FormData>(makeJudgeAction, { status: "idle" });

  return (
    <Card>
      <CardHeader
        title="Create a judge"
        description="The faculty member keeps their existing account and roles; judging is added to it."
      />
      <CardBody>
        <form action={action} className="flex flex-wrap items-end gap-3">
          {state.status === "error" ? <ErrorState title="Not granted" description={state.message} /> : null}
          {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}

          <Field label="Faculty member" htmlFor="userId" required className="min-w-[18rem] flex-1">
            <Select id="userId" name="userId" required>
              {faculty.length ? (
                faculty.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))
              ) : (
                <option value="">Every faculty member in scope is already a judge</option>
              )}
            </Select>
          </Field>
          <Button type="submit" disabled={!faculty.length}>
            Grant judge capability
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
