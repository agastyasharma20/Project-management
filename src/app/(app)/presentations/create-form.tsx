"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, Select, SuccessNote } from "@/components/ui";
import { createPresentationAction, type PresentationState } from "./actions";

interface Option {
  value: string;
  label: string;
}

export function CreatePresentationForm({
  options,
}: {
  options: { years: Option[]; departments: Option[]; semesters: Option[]; types: Option[]; schemes: Option[] };
}) {
  const [state, action] = useActionState<PresentationState, FormData>(createPresentationAction, { status: "idle" });

  return (
    <Card>
      <CardHeader
        title="Create a presentation event"
        description="Leave a scope field blank to include every option — presentation count is not fixed."
      />
      <CardBody>
        <form action={action} className="space-y-4">
          {state.status === "error" ? <ErrorState title="Not created" description={state.message} /> : null}
          {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required>
              <Input id="name" name="name" placeholder="Presentation 3" required />
            </Field>
            <Field label="Academic year" htmlFor="academicYearId" required>
              <Select id="academicYearId" name="academicYearId" required>
                {options.years.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Department" htmlFor="departmentId">
              <Select id="departmentId" name="departmentId">
                <option value="">All departments</option>
                {options.departments.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Semester" htmlFor="semesterId">
              <Select id="semesterId" name="semesterId">
                <option value="">All semesters</option>
                {options.semesters.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Project type" htmlFor="projectTypeId">
              <Select id="projectTypeId" name="projectTypeId">
                <option value="">All types</option>
                {options.types.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Marking scheme" htmlFor="schemeId">
              <Select id="schemeId" name="schemeId">
                <option value="">Attach later</option>
                {options.schemes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" htmlFor="scheduledOn" required>
              <Input id="scheduledOn" name="scheduledOn" type="date" required />
            </Field>
            <Field label="Venue" htmlFor="venue">
              <Input id="venue" name="venue" placeholder="Seminar Hall 2" />
            </Field>
            <Field label="Start time" htmlFor="startTime">
              <Input id="startTime" name="startTime" type="time" />
            </Field>
            <Field label="End time" htmlFor="endTime">
              <Input id="endTime" name="endTime" type="time" />
            </Field>
          </div>

          <Button type="submit">Create event</Button>
        </form>
      </CardBody>
    </Card>
  );
}
