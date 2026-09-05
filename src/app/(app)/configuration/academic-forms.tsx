"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, Select, SuccessNote } from "@/components/ui";
import { createAcademicRecordAction, type ConfigState } from "./actions";

interface Option {
  value: string;
  label: string;
}

const IDLE: ConfigState = { status: "idle" };

function Feedback({ state }: { state: ConfigState }) {
  if (state.status === "error") return <ErrorState title="Not saved" description={state.message} />;
  if (state.status === "success") return <SuccessNote>{state.message}</SuccessNote>;
  return null;
}

export function AcademicConfigForms({
  collegeWide,
  departments,
  years,
  semesters,
  types,
}: {
  collegeWide: boolean;
  departments: Option[];
  years: Option[];
  semesters: Option[];
  types: Option[];
}) {
  const [deptState, addDepartment] = useActionState(createAcademicRecordAction, IDLE);
  const [sectionState, addSection] = useActionState(createAcademicRecordAction, IDLE);
  const [yearState, addYear] = useActionState(createAcademicRecordAction, IDLE);
  const [mapState, mapSemester] = useActionState(createAcademicRecordAction, IDLE);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {collegeWide ? (
        <Card>
          <CardHeader title="Add a department" description="The code becomes part of every Team ID." />
          <CardBody>
            <form action={addDepartment} className="space-y-3">
              <Feedback state={deptState} />
              <input type="hidden" name="entity" value="department" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Code" htmlFor="dept-code" required hint="2–8 letters, e.g. AIDS">
                  <Input id="dept-code" name="code" required maxLength={8} className="uppercase" />
                </Field>
                <Field label="Name" htmlFor="dept-name">
                  <Input id="dept-name" name="name" placeholder="Artificial Intelligence & Data Science" />
                </Field>
              </div>
              <Button type="submit" variant="secondary">
                Add department
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Add a section" description="Sections are per-department; A/B/C is not assumed." />
        <CardBody>
          <form action={addSection} className="space-y-3">
            <Feedback state={sectionState} />
            <input type="hidden" name="entity" value="section" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Department" htmlFor="sec-dept" required>
                <Select id="sec-dept" name="departmentId" required>
                  {departments.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Section name" htmlFor="sec-name" required>
                <Input id="sec-name" name="name" required maxLength={20} />
              </Field>
            </div>
            <Button type="submit" variant="secondary">
              Add section
            </Button>
          </form>
        </CardBody>
      </Card>

      {collegeWide ? (
        <Card>
          <CardHeader title="Add an academic year" description="Historical years stay accessible for analytics." />
          <CardBody>
            <form action={addYear} className="space-y-3">
              <Feedback state={yearState} />
              <input type="hidden" name="entity" value="academicYear" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Label" htmlFor="year-label" required>
                  <Input id="year-label" name="label" placeholder="2027-28" required />
                </Field>
                <Field label="Starts on" htmlFor="year-start" required>
                  <Input id="year-start" name="startsOn" type="date" required />
                </Field>
                <Field label="Ends on" htmlFor="year-end" required>
                  <Input id="year-end" name="endsOn" type="date" required />
                </Field>
              </div>
              <Button type="submit" variant="secondary">
                Add academic year
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Map a semester to a project type"
          description="Also sets the expected number of meetings used by analytics."
        />
        <CardBody>
          <form action={mapSemester} className="space-y-3">
            <Feedback state={mapState} />
            <input type="hidden" name="entity" value="academicConfig" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Academic year" htmlFor="map-year" required>
                <Select id="map-year" name="academicYearId" required>
                  {years.map((y) => (
                    <option key={y.value} value={y.value}>
                      {y.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Semester" htmlFor="map-semester" required>
                <Select id="map-semester" name="semesterId" required>
                  {semesters.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Project type" htmlFor="map-type" required>
                <Select id="map-type" name="projectTypeId" required>
                  {types.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expected meetings" htmlFor="map-meetings">
                <Input id="map-meetings" name="expectedMeetings" type="number" min={1} defaultValue={12} className="tabular" />
              </Field>
            </div>
            <Button type="submit" variant="secondary">
              Save mapping
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
