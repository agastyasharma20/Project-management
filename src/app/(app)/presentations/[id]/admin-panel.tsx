"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Select, SuccessNote } from "@/components/ui";
import {
  assignJudgeAction,
  autoScheduleTeamsAction,
  setVisibilityAction,
  type PresentationState,
} from "../actions";

const IDLE: PresentationState = { status: "idle" };

function Feedback({ state }: { state: PresentationState }) {
  if (state.status === "error") return <ErrorState title="Action failed" description={state.message} />;
  if (state.status === "success") return <SuccessNote>{state.message}</SuccessNote>;
  return null;
}

export function PresentationAdminPanel({
  presentationId,
  marksVisibility,
  judges,
}: {
  presentationId: string;
  marksVisibility: string;
  judges: { value: string; label: string }[];
}) {
  const [scheduleState, schedule] = useActionState(autoScheduleTeamsAction, IDLE);
  const [judgeState, assign] = useActionState(assignJudgeAction, IDLE);
  const [visibilityState, setVisibility] = useActionState(setVisibilityAction, IDLE);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader title="Schedule teams" description="Adds every eligible team matching this event's scope." />
        <CardBody className="space-y-3">
          <Feedback state={scheduleState} />
          <form action={schedule}>
            <input type="hidden" name="presentationId" value={presentationId} />
            <Button type="submit" variant="secondary">
              Schedule eligible teams
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Assign a judge" description="Faculty holding the Judge role." />
        <CardBody className="space-y-3">
          <Feedback state={judgeState} />
          <form action={assign} className="space-y-3">
            <input type="hidden" name="presentationId" value={presentationId} />
            <Field label="Judge" htmlFor="judgeUserId" required>
              <Select id="judgeUserId" name="judgeUserId" required>
                {judges.length ? (
                  judges.map((j) => (
                    <option key={j.value} value={j.value}>
                      {j.label}
                    </option>
                  ))
                ) : (
                  <option value="">No judges available — create one first</option>
                )}
              </Select>
            </Field>
            <Button type="submit" variant="secondary" disabled={!judges.length}>
              Assign
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Marks release"
          description="Marks are an institutional record — visible only to HOD, Admin, Director and Super Admin, never to students or faculty mentors. Publishing marks finalises the evaluation."
        />
        <CardBody className="space-y-3">
          <Feedback state={visibilityState} />
          <form action={setVisibility} className="space-y-3">
            <input type="hidden" name="presentationId" value={presentationId} />
            <Field label="Visibility" htmlFor="visibility" required>
              <Select id="visibility" name="visibility" defaultValue={marksVisibility}>
                {["DRAFT", "SUBMITTED", "REVIEWED", "PUBLISHED"].map((v) => (
                  <option key={v} value={v}>
                    {v.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Update</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
