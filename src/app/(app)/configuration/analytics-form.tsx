"use client";

import { useActionState, useState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, SuccessNote } from "@/components/ui";
import type { HealthWeights, RiskRules } from "@/lib/services/settings";
import { saveAnalyticsAction, type ConfigState } from "./actions";

export function AnalyticsConfigForm({ weights, risks }: { weights: HealthWeights; risks: RiskRules }) {
  const [state, action] = useActionState<ConfigState, FormData>(saveAnalyticsAction, { status: "idle" });
  const [w, setW] = useState(weights);
  const total = w.meetingActivity + w.attendance + w.presentation + w.progress + w.repository;

  const weightField = (key: keyof HealthWeights, label: string) => (
    <Field label={label} htmlFor={key} key={key}>
      <Input
        id={key}
        name={key}
        type="number"
        min={0}
        max={100}
        value={w[key]}
        onChange={(e) => setW((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
        className="tabular text-right"
      />
    </Field>
  );

  return (
    <Card>
      <CardHeader
        title="Health score and risk rules"
        description="A transparent rules engine — no machine learning is claimed or used."
      />
      <CardBody>
        <form action={action} className="space-y-5">
          {state.status === "error" ? <ErrorState title="Not saved" description={state.message} /> : null}
          {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}

          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">
              Health weights ({total}/100 {total === 100 ? "✓" : "— must total 100"})
            </legend>
            <div className="grid gap-4 sm:grid-cols-5">
              {weightField("meetingActivity", "Meeting activity")}
              {weightField("attendance", "Attendance")}
              {weightField("presentation", "Presentation")}
              {weightField("progress", "Progress")}
              {weightField("repository", "Repository")}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Risk thresholds</legend>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Max days without a meeting" htmlFor="maxDaysWithoutMeeting">
                <Input
                  id="maxDaysWithoutMeeting"
                  name="maxDaysWithoutMeeting"
                  type="number"
                  min={1}
                  defaultValue={risks.maxDaysWithoutMeeting}
                  className="tabular text-right"
                />
              </Field>
              <Field label="Minimum attendance %" htmlFor="minAttendancePct">
                <Input
                  id="minAttendancePct"
                  name="minAttendancePct"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={risks.minAttendancePct}
                  className="tabular text-right"
                />
              </Field>
              <Field label="Max rejected submissions" htmlFor="maxRejectedMeetings">
                <Input
                  id="maxRejectedMeetings"
                  name="maxRejectedMeetings"
                  type="number"
                  min={0}
                  defaultValue={risks.maxRejectedMeetings}
                  className="tabular text-right"
                />
              </Field>
              <Field label="Minimum presentation %" htmlFor="minPresentationPct">
                <Input
                  id="minPresentationPct"
                  name="minPresentationPct"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={risks.minPresentationPct}
                  className="tabular text-right"
                />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                name="requireRepositoryLinks"
                defaultChecked={risks.requireRepositoryLinks}
                className="h-4 w-4"
              />
              Flag teams that have not published repository links
            </label>
          </fieldset>

          <Button type="submit" disabled={total !== 100}>
            Save analytics configuration
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
