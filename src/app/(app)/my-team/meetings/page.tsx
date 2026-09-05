import { requirePrincipal } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { formatDateTime, formatPct } from "@/lib/utils";

export const metadata = { title: "My meetings" };

export default async function MyMeetingsPage() {
  const principal = await requirePrincipal();
  if (!principal.studentProfileId) {
    return (
      <Card>
        <EmptyState title="No student profile on this account" />
      </Card>
    );
  }

  const membership = await db.teamMember.findFirst({
    where: { studentId: principal.studentProfileId, removedAt: null },
    select: { teamId: true, team: { select: { teamId: true, projectTitle: true } } },
  });

  if (!membership) {
    return (
      <>
        <PageHeader title="Meetings" />
        <Card>
          <EmptyState title="You are not in a team yet" />
        </Card>
      </>
    );
  }

  const meetings = await db.meeting.findMany({
    where: { teamId: membership.teamId, status: { not: "REJECTED" } },
    orderBy: { heldAt: "desc" },
    include: {
      mentor: { select: { name: true } },
      attendance: { where: { studentId: principal.studentProfileId } },
    },
  });

  const mine = meetings.flatMap((m) => m.attendance);
  const pct = mine.length ? (mine.filter((a) => a.present).length / mine.length) * 100 : null;

  return (
    <>
      <PageHeader
        title="Meetings"
        description={`${membership.team.teamId} · ${membership.team.projectTitle}`}
      />

      <Card>
        <CardHeader
          title={`${meetings.length} meeting${meetings.length === 1 ? "" : "s"}`}
          description={`Your attendance: ${formatPct(pct, 1)}`}
        />
        {meetings.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Held</Th>
                <Th>Discussion</Th>
                <Th>Recorded by</Th>
                <Th>Team present</Th>
                <Th>You</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id}>
                  <Td className="font-medium">{m.code}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(m.heldAt)}</Td>
                  <Td className="max-w-[22rem]">{m.discussion}</Td>
                  <Td>{m.mentor.name}</Td>
                  <Td className="tabular">
                    {m.presentCount}/{m.memberCount}
                  </Td>
                  <Td>
                    {m.attendance[0] ? (
                      <Badge tone={m.attendance[0].present ? "success" : "danger"}>
                        {m.attendance[0].present ? "Present" : "Absent"}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={m.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No meetings recorded yet" />
        )}
      </Card>
    </>
  );
}
