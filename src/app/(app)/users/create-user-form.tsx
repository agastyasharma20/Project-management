"use client";

import { useActionState, useState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, Select, SuccessNote } from "@/components/ui";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/domain/constants";
import { createUserAction, type UserState } from "./actions";

const ELEVATED: Role[] = ["SUPER_ADMIN", "DIRECTOR", "ADMIN"];

export function CreateUserForm({
  collegeWide,
  departments,
  sections,
  semesters,
}: {
  collegeWide: boolean;
  departments: { value: string; label: string }[];
  sections: { value: string; label: string }[];
  semesters: { value: string; label: string }[];
}) {
  const [state, action] = useActionState<UserState, FormData>(createUserAction, { status: "idle" });
  const [roles, setRoles] = useState<Role[]>(["STUDENT"]);

  const isStudent = roles.includes("STUDENT");
  const isFaculty = roles.some((r) => r === "FACULTY_MENTOR" || r === "HOD" || r === "JUDGE");
  const available = collegeWide ? ROLES : ROLES.filter((r) => !ELEVATED.includes(r));

  return (
    <Card>
      <CardHeader
        title="Add a user"
        description="One account can hold several roles — an HOD who also mentors and judges needs no second login."
      />
      <CardBody>
        <form action={action} className="space-y-4">
          {state.status === "error" ? <ErrorState title="Not created" description={state.message} /> : null}
          {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}

          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">Roles</legend>
            <div className="flex flex-wrap gap-2">
              {available.map((role) => (
                <label
                  key={role}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-[13px]"
                >
                  <input
                    type="checkbox"
                    name="roles"
                    value={role}
                    checked={roles.includes(role)}
                    onChange={(e) =>
                      setRoles((prev) => (e.target.checked ? [...prev, role] : prev.filter((r) => r !== role)))
                    }
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" required>
              <Input id="name" name="name" required />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <Input id="email" name="email" type="email" required />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" />
            </Field>
            <Field label="Temporary password" htmlFor="password" required hint="At least 8 characters with a letter and a number.">
              <Input id="password" name="password" type="text" required minLength={8} />
            </Field>
            <Field label="Department" htmlFor="departmentId" required={!collegeWide || isStudent || isFaculty}>
              <Select id="departmentId" name="departmentId">
                <option value="">College-wide (no department)</option>
                {departments.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>

            {isStudent ? (
              <>
                <Field label="Enrollment number" htmlFor="enrollmentNo" required>
                  <Input id="enrollmentNo" name="enrollmentNo" placeholder="0808CS221001" required />
                </Field>
                <Field label="Section" htmlFor="sectionId">
                  <Select id="sectionId" name="sectionId">
                    <option value="">Not set</option>
                    {sections.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Semester" htmlFor="semesterId">
                  <Select id="semesterId" name="semesterId">
                    <option value="">Not set</option>
                    {semesters.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            ) : null}

            {isFaculty ? (
              <>
                <Field label="Employee code" htmlFor="employeeCode">
                  <Input id="employeeCode" name="employeeCode" placeholder="PIEMR-CSE-F014" />
                </Field>
                <Field label="Designation" htmlFor="designation">
                  <Input id="designation" name="designation" placeholder="Assistant Professor" />
                </Field>
              </>
            ) : null}
          </div>

          <Button type="submit">Create user</Button>
        </form>
      </CardBody>
    </Card>
  );
}
