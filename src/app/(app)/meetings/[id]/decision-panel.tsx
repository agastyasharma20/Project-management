"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Select, SuccessNote, Textarea } from "@/components/ui";
import { decideMeetingAction, type MeetingDecisionState } from "./actions";

export function MeetingDecisionPanel({ meetingId }: { meetingId: string }) {
  const [state, action] = useActionState<MeetingDecisionState, FormData>(decideMeetingAction, { status: "idle" });

  return (
    <Card>
      <CardHeader
        title="Approve evidence"
        description="Rejection returns the record to the mentor with your reason."
      />
      <CardBody>
        <form action={action} className="space-y-3">
          {state.status === "error" ? <ErrorState title="Could not record" description={state.message} /> : null}
          {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}
          <input type="hidden" name="meetingId" value={meetingId} />

          <Field label="Decision" htmlFor="action" required>
            <Select id="action" name="action" defaultValue="APPROVE">
              <option value="APPROVE">Approve</option>
              <option value="REQUEST_RESUBMISSION">Request resubmission</option>
              <option value="REJECT">Reject</option>
            </Select>
          </Field>

          <Field label="Reason" htmlFor="reason" hint="Required for anything other than approval.">
            <Textarea id="reason" name="reason" rows={2} maxLength={400} />
          </Field>

          <Button type="submit">Record decision</Button>
        </form>
      </CardBody>
    </Card>
  );
}
