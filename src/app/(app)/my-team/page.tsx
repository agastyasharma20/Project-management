import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, EmptyState, ButtonLink, PageHeader } from "@/components/ui";

export const metadata = { title: "My team" };

/** Students land on their own team's workspace, which is the same view as /teams/[id]. */
export default async function MyTeamPage() {
  const principal = await requirePrincipal();

  if (!principal.studentProfileId) {
    return (
      <>
        <PageHeader title="My team" />
        <Card>
          <EmptyState title="This account has no student profile" description="Contact your department office." />
        </Card>
      </>
    );
  }

  const membership = await db.teamMember.findFirst({
    where: { studentId: principal.studentProfileId, removedAt: null },
    select: { teamId: true },
  });

  if (!membership) {
    return (
      <>
        <PageHeader title="My team" />
        <Card>
          <EmptyState
            title="You are not in a team yet"
            description="Team leads register the project; other members are added by enrollment number."
            action={<ButtonLink href="/register" variant="primary">Register a team</ButtonLink>}
          />
        </Card>
      </>
    );
  }

  redirect(`/teams/${membership.teamId}`);
}
