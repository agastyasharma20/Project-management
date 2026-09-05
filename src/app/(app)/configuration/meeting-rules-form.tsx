"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, Select, SuccessNote } from "@/components/ui";
import type { MeetingRules } from "@/lib/services/settings";
import { saveMeetingRulesAction, type ConfigState } from "./actions";

const APPROVERS = ["FACULTY_MENTOR", "HOD", "ADMIN", "DIRECTOR", "SUPER_ADMIN"] as const;

export function MeetingRulesForm({
  current,
  collegeWide,
  departments,
}: {
  current: MeetingRules;
  collegeWide: boolean;
  departments: { value: string; label: string }[];
}) {
  const [state, action] = useActionState<ConfigState, FormData>(saveMeetingRulesAction, { status: "idle" });

  return (
    <Card>
      <CardHeader title="Meeting rules" description="Cadence expectations and who may approve evidence." />
      <CardBody>
        <form action={action} className="space-y-4">
          {state.status === "error" ? <ErrorState title="Not saved" description={state.message} /> : null}
          {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}

          <Field label="Scope" htmlFor="mr-departmentId">
            <Select id="mr-departmentId" name="departmentId" defaultValue="">
              {collegeWide ? <option value="">College-wide default</option> : null}
              {departments.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label} override
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Frequency" htmlFor="frequency" required>
              <Select id="frequency" name="frequency" defaultValue={current.frequency}>
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Biweekly</option>
                <option value="CUSTOM">Custom</option>
              </Select>
            </Field>
            <Field label="Interval (days)" htmlFor="intervalDays" required>
              <Input
                id="intervalDays"
                name="intervalDays"
                type="number"
                min={1}
                max={90}
                defaultValue={current.intervalDays}
                required
                className="tabular"
              />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">Roles that may approve evidence</legend>
            <div className="flex flex-wrap gap-2">
              {APPROVERS.map((role) => (
                <label key={role} className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    name="approverRoles"
                    value={role}
                    defaultChecked={current.approverRoles.includes(role)}
                  />
                  {role.replace(/_/g, " ").toLowerCase()}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="requireApproval" defaultChecked={current.requireApproval} className="h-4 w-4" />
            Require an approval before a meeting counts
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              name="mentorSelfApproves"
              defaultChecked={current.mentorSelfApproves}
              className="h-4 w-4"
            />
            The recording mentor's own submission satisfies the approval
          </label>

          <Button type="submit">Save meeting rules</Button>
        </form>
      </CardBody>
    </Card>
  );
}
