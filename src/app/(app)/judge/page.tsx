import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { Button, Card, CardBody, CardHeader, ErrorState, Field, Input, InfoNote, PageHeader } from "@/components/ui";
import { param } from "@/lib/utils";

export const metadata = { title: "Evaluate a team" };

export default async function JudgeEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["marks.enter"]);
  if (denied) return denied;
  const sp = await searchParams;
  const error = param(sp, "error");

  async function open(formData: FormData) {
    "use server";
    const code = String(formData.get("teamCode") ?? "").trim().toUpperCase();
    if (!code) redirect("/judge?error=Enter+a+Team+ID");
    redirect(`/judge/${encodeURIComponent(code)}`);
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Evaluate a team" description="Enter the Team ID printed on the team's project card." />

      <Card>
        <CardHeader title="Team ID" />
        <CardBody className="space-y-4">
          {error ? <ErrorState title="Cannot open team" description={error} /> : null}
          <form action={open} className="space-y-4">
            <Field label="Team ID" htmlFor="teamCode" required hint="Example: PIEMR-CSE-001">
              <Input
                id="teamCode"
                name="teamCode"
                placeholder="PIEMR-CSE-001"
                autoCapitalize="characters"
                autoComplete="off"
                required
                autoFocus
                className="text-center text-lg tracking-wider"
              />
            </Field>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
          <InfoNote>
            You will only see project information for teams scheduled into presentations you are assigned to.
          </InfoNote>
        </CardBody>
      </Card>
    </div>
  );
}
