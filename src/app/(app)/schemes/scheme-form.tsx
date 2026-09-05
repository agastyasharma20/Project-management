"use client";

import { useActionState, useState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, Select, SuccessNote } from "@/components/ui";
import { createSchemeAction, type SchemeState } from "./actions";

interface Row {
  label: string;
  description: string;
  maxMarks: string;
  weight: string;
}

const BLANK: Row = { label: "", description: "", maxMarks: "10", weight: "1" };

export function SchemeForm({
  departments,
  types,
}: {
  departments: { value: string; label: string }[];
  types: { value: string; label: string }[];
}) {
  const [state, action] = useActionState<SchemeState, FormData>(createSchemeAction, { status: "idle" });
  const [rows, setRows] = useState<Row[]>([
    { label: "Problem Understanding", description: "", maxMarks: "10", weight: "1" },
    { label: "Technical Implementation", description: "", maxMarks: "20", weight: "1" },
  ]);

  const total = rows.reduce((s, r) => s + (Number(r.maxMarks) || 0), 0);
  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <Card>
      <CardHeader title="Create a marking scheme" description="The declared total must match the sum of the criteria." />
      <CardBody>
        <form action={action} className="space-y-4">
          {state.status === "error" ? <ErrorState title="Not created" description={state.message} /> : null}
          {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Scheme name" htmlFor="name" required>
              <Input id="name" name="name" placeholder="Major Presentation 2" required />
            </Field>
            <Field label="Department" htmlFor="departmentId">
              <Select id="departmentId" name="departmentId">
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Project type" htmlFor="projectTypeId">
              <Select id="projectTypeId" name="projectTypeId">
                <option value="">All types</option>
                {types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium">Criteria</legend>
            {rows.map((row, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-[var(--color-line)] p-3 sm:grid-cols-[2fr_2fr_5rem_5rem_auto]">
                <Input
                  name="criterionLabel"
                  aria-label={`Criterion ${i + 1} label`}
                  placeholder="Criterion"
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
                <Input
                  name="criterionDescription"
                  aria-label={`Criterion ${i + 1} description`}
                  placeholder="Description (optional)"
                  value={row.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
                <Input
                  name="criterionMax"
                  type="number"
                  min={1}
                  aria-label={`Criterion ${i + 1} maximum marks`}
                  value={row.maxMarks}
                  onChange={(e) => update(i, { maxMarks: e.target.value })}
                  className="tabular text-right"
                />
                <Input
                  name="criterionWeight"
                  type="number"
                  step="0.1"
                  min={0}
                  aria-label={`Criterion ${i + 1} weight`}
                  value={row.weight}
                  onChange={(e) => update(i, { weight: e.target.value })}
                  className="tabular text-right"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={rows.length <= 2}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setRows((p) => [...p, { ...BLANK }])}>
              Add criterion
            </Button>
          </fieldset>

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Declared total" htmlFor="totalMarks" hint={`Criteria currently sum to ${total}`}>
              <Input id="totalMarks" name="totalMarks" type="number" value={total} readOnly className="tabular w-28 text-right" />
            </Field>
            <Button type="submit">Create scheme</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
