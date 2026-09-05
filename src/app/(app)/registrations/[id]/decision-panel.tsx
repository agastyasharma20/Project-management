"use client";

import { useActionState, useState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, SuccessNote, Textarea } from "@/components/ui";
import { approveAction, rejectAction, type DecisionState } from "./actions";

const IDLE: DecisionState = { status: "idle" };

export function DecisionPanel({ teamId }: { teamId: string }) {
  const [approveState, approve] = useActionState(approveAction, IDLE);
  const [rejectState, reject] = useActionState(rejectAction, IDLE);
  const [mode, setMode] = useState<"none" | "approve" | "reject">("none");

  const state = approveState.status !== "idle" ? approveState : rejectState;

  return (
    <Card>
      <CardHeader
        title="Decision"
        description="Approving issues the next department Team ID. Rejecting returns the form to the team lead."
      />
      <CardBody className="space-y-3">
        {state.status === "error" ? <ErrorState title="Action failed" description={state.message} /> : null}
        {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}

        {mode === "none" ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode("approve")}>Approve registration</Button>
            <Button variant="secondary" onClick={() => setMode("reject")}>
              Request correction
            </Button>
          </div>
        ) : null}

        {mode === "approve" ? (
          <form action={approve} className="space-y-3">
            <input type="hidden" name="teamId" value={teamId} />
            <p className="text-[13px]">
              Confirm approval? A permanent Team ID will be generated and the team becomes active.
            </p>
            <div className="flex gap-2">
              <Button type="submit">Yes, approve</Button>
              <Button type="button" variant="ghost" onClick={() => setMode("none")}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {mode === "reject" ? (
          <form action={reject} className="space-y-3">
            <input type="hidden" name="teamId" value={teamId} />
            <Field label="Reason for correction" htmlFor="reason" required>
              <Textarea id="reason" name="reason" rows={3} required maxLength={500} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="danger">
                Send back
              </Button>
              <Button type="button" variant="ghost" onClick={() => setMode("none")}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
