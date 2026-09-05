"use client";

import { useActionState } from "react";
import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, Select, SuccessNote, Textarea } from "@/components/ui";
import { addResourceAction, type ActionState } from "./actions";

export function ResourceForm({
  teamId,
  categories,
}: {
  teamId: string;
  categories: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(addResourceAction, { status: "idle" });

  return (
    <Card>
      <CardHeader title="Add a resource" description="Links are preferred over uploads for GitHub and Drive." />
      <CardBody>
        <form action={action} className="space-y-4">
          {state.status === "error" ? <ErrorState title="Could not add resource" description={state.message} /> : null}
          {state.status === "success" ? <SuccessNote>{state.message}</SuccessNote> : null}
          <input type="hidden" name="teamId" value={teamId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="categoryId" required>
              <Select id="categoryId" name="categoryId" required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Title" htmlFor="title" required>
              <Input id="title" name="title" placeholder="Source repository" required />
            </Field>
          </div>

          <Field label="URL" htmlFor="url" required hint="Must start with https://">
            <Input id="url" name="url" type="url" placeholder="https://github.com/team/project" required />
          </Field>

          <Field label="Description" htmlFor="description">
            <Textarea id="description" name="description" rows={2} maxLength={500} />
          </Field>

          <Button type="submit">Add resource</Button>
        </form>
      </CardBody>
    </Card>
  );
}
