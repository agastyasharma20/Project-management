"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, Select, SuccessNote } from "@/components/ui";
import { saveGeofenceAction, type ConfigState } from "./actions";

export function GeofenceForm({
  current,
  collegeWide,
  departments,
}: {
  current: {
    name: string;
    latitude: number;
    longitude: number;
    radiusM: number;
    minAccuracyM: number;
    goodAccuracyM: number;
    warnAccuracyM: number;
    enforce: boolean;
  };
  collegeWide: boolean;
  departments: { value: string; label: string }[];
}) {
  const [state, action] = useActionState<ConfigState, FormData>(saveGeofenceAction, { status: "idle" });

  return (
    <Card>
      <CardHeader
        title="Campus geofence"
        description="The anchor, radius and accuracy policy applied when meeting evidence is submitted."
      />
      <CardBody>
        <form action={action} className="space-y-4">
          {state.status === "error" ? <ErrorState title="Not saved" description={state.message} /> : null}
          {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}

          <Field label="Anchor name" htmlFor="name" required hint="Shown on the evidence stamp when inside the fence.">
            <Input id="name" name="name" defaultValue={current.name} required />
          </Field>

          <Field label="Scope" htmlFor="departmentId">
            <Select id="departmentId" name="departmentId" defaultValue="">
              {collegeWide ? <option value="">College-wide default</option> : null}
              {departments.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label} override
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latitude" htmlFor="latitude" required>
              <Input id="latitude" name="latitude" type="number" step="0.000001" defaultValue={current.latitude} required className="tabular" />
            </Field>
            <Field label="Longitude" htmlFor="longitude" required>
              <Input id="longitude" name="longitude" type="number" step="0.000001" defaultValue={current.longitude} required className="tabular" />
            </Field>
            <Field label="Allowed radius (m)" htmlFor="radiusM" required>
              <Input id="radiusM" name="radiusM" type="number" min={10} defaultValue={current.radiusM} required className="tabular" />
            </Field>
            <Field label="Reject beyond accuracy (m)" htmlFor="minAccuracyM" required>
              <Input id="minAccuracyM" name="minAccuracyM" type="number" min={5} defaultValue={current.minAccuracyM} required className="tabular" />
            </Field>
            <Field label="Good accuracy up to (m)" htmlFor="goodAccuracyM" required>
              <Input id="goodAccuracyM" name="goodAccuracyM" type="number" min={1} defaultValue={current.goodAccuracyM} required className="tabular" />
            </Field>
            <Field label="Warning accuracy up to (m)" htmlFor="warnAccuracyM" required>
              <Input id="warnAccuracyM" name="warnAccuracyM" type="number" min={1} defaultValue={current.warnAccuracyM} required className="tabular" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="enforce" defaultChecked={current.enforce} className="h-4 w-4" />
            Block submissions that fall outside the fence
          </label>

          <Button type="submit">Save geofence</Button>
        </form>
      </CardBody>
    </Card>
  );
}
