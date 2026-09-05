"use client";

import { useActionState, useState } from "react";
import { Button, CardBody, ErrorState, Field, SuccessNote, Textarea } from "@/components/ui";
import { saveMarksAction, type MarksState } from "./actions";

interface Criterion {
  id: string;
  label: string;
  description: string | null;
  maxMarks: number;
}

export function MarksForm({
  presentationTeamId,
  schemeName,
  totalMarks,
  criteria,
  existing,
}: {
  presentationTeamId: string;
  schemeName: string;
  totalMarks: number;
  criteria: Criterion[];
  existing: { status: string; remarks: string | null; marks: Record<string, number> } | null;
}) {
  const [state, action] = useActionState<MarksState, FormData>(saveMarksAction, { status: "idle" });
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(criteria.map((c) => [c.id, existing?.marks[c.id]?.toString() ?? ""])),
  );

  const locked = existing?.status === "SUBMITTED" || state.status === "success";
  const runningTotal = criteria.reduce((sum, c) => sum + (Number(values[c.id]) || 0), 0);

  return (
    <CardBody>
      <form action={action} className="space-y-4">
        {state.status === "error" ? <ErrorState title="Not saved" description={state.message} /> : null}
        {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}
        <input type="hidden" name="presentationTeamId" value={presentationTeamId} />

        <p className="text-[12px] uppercase tracking-wide text-[var(--color-muted)]">{schemeName}</p>

        <ul className="space-y-2">
          {criteria.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] px-3 py-2">
              <label htmlFor={`mark-${c.id}`} className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{c.label}</span>
                {c.description ? (
                  <span className="block text-[12px] text-[var(--color-muted)]">{c.description}</span>
                ) : null}
              </label>
              <div className="flex shrink-0 items-center gap-1">
                <input
                  id={`mark-${c.id}`}
                  name={`mark:${c.id}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={c.maxMarks}
                  step="0.5"
                  disabled={locked}
                  value={values[c.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
                  className="tabular h-10 w-20 rounded-lg border border-[var(--color-line-strong)] px-2 text-right text-sm disabled:bg-slate-50"
                />
                <span className="tabular w-10 text-[13px] text-[var(--color-muted)]">/{c.maxMarks}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between rounded-lg bg-[var(--color-canvas)] px-3 py-2">
          <span className="text-[13px] font-semibold">Total</span>
          <span className="tabular text-[15px] font-semibold">
            {runningTotal} / {totalMarks}
          </span>
        </div>

        <Field label="Remarks (optional)" htmlFor={`remarks-${presentationTeamId}`}>
          <Textarea
            id={`remarks-${presentationTeamId}`}
            name="remarks"
            rows={2}
            maxLength={500}
            defaultValue={existing?.remarks ?? ""}
            disabled={locked}
          />
        </Field>

        {locked ? (
          <p className="text-[13px] text-[var(--color-muted)]">
            Your evaluation has been submitted. Ask an administrator to reopen it if a correction is needed.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="save" variant="secondary">
              Save draft
            </Button>
            <Button type="submit" name="intent" value="submit">
              Submit marks
            </Button>
          </div>
        )}
      </form>
    </CardBody>
  );
}
