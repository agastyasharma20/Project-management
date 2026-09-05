import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { db } from "@/lib/db";
import { teamScopeWhere } from "@/lib/services/teams";
import { ButtonLink, Card, CardHeader, EmptyState, InfoNote, PageHeader } from "@/components/ui";
import { relativeDays } from "@/lib/utils";

export const metadata = { title: "Record meeting" };

export default async function RecordMeetingPage() {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["meeting.record"]);
  if (denied) return denied;

  const teams = await db.team.findMany({
    where: {
      AND: [
        teamScopeWhere(principal),
        { registrationStatus: "APPROVED", status: { not: "ARCHIVED" } },
        principal.roles.includes("HOD") ? {} : { mentorUserId: principal.userId },
      ],
    },
    include: {
      members: { where: { removedAt: null }, select: { id: true } },
      meetings: { orderBy: { heldAt: "desc" }, take: 1, select: { heldAt: true } },
    },
    orderBy: { teamId: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Record an official meeting"
        description="Pick a team. The next screen verifies your location, opens the camera and captures the evidence."
      />

      <InfoNote>
        Evidence must be captured live on this device. Location and time are read from the device at capture
        and stamped onto the photo by the server — they cannot be typed in or edited afterwards.
      </InfoNote>

      <Card className="mt-4">
        <CardHeader title="My teams" description={`${teams.length} team(s) available`} />
        {teams.length ? (
          <ul className="divide-y divide-[var(--color-line)]">
            {teams.map((team) => (
              <li key={team.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">{team.teamId}</p>
                  <p className="truncate text-[13px] text-[var(--color-muted)]">{team.projectTitle}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
                    {team.members.length} members · last meeting {relativeDays(team.meetings[0]?.heldAt ?? null)}
                  </p>
                </div>
                <ButtonLink href={`/meetings/record/${team.id}`} variant="primary" className="shrink-0">
                  Start
                </ButtonLink>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No teams assigned"
            description="Approved teams that you mentor will appear here."
          />
        )}
      </Card>
    </>
  );
}
