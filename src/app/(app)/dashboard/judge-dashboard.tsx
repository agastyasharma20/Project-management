import { db } from "@/lib/db";
import type { Principal } from "@/lib/auth/rbac";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export async function JudgeDashboard({ principal }: { principal: Principal }) {
  const [assignments, submissions] = await Promise.all([
    db.judgeAssignment.findMany({
      where: { judgeUserId: principal.userId },
      include: {
        presentation: {
          include: { department: { select: { code: true } }, _count: { select: { teams: true } } },
        },
      },
      orderBy: { presentation: { scheduledOn: "asc" } },
    }),
    db.judgeSubmission.findMany({
      where: { judgeUserId: principal.userId, status: "SUBMITTED" },
      include: {
        presentationTeam: {
          include: { team: { select: { teamId: true, projectTitle: true } }, presentation: { select: { name: true } } },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Evaluation"
        description="Enter a Team ID to open the project and record your marks."
        action={<ButtonLink href="/judge" variant="primary">Evaluate a team</ButtonLink>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Assigned presentations" value={assignments.length} />
        <Stat label="Teams to evaluate" value={assignments.reduce((s, a) => s + a.presentation._count.teams, 0)} />
        <Stat label="Evaluations submitted" value={submissions.length} tone="success" />
      </div>

      <Card className="mt-5">
        <CardHeader title="My presentations" />
        {assignments.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Presentation</Th>
                <Th>Department</Th>
                <Th>Date</Th>
                <Th>Venue</Th>
                <Th>Teams</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <Td className="font-medium">{a.presentation.name}</Td>
                  <Td>{a.presentation.department?.code ?? "All"}</Td>
                  <Td className="whitespace-nowrap">{formatDate(a.presentation.scheduledOn)}</Td>
                  <Td>{a.presentation.venue ?? "—"}</Td>
                  <Td className="tabular">{a.presentation._count.teams}</Td>
                  <Td>
                    <StatusBadge status={a.presentation.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No presentations assigned" description="An administrator assigns judges to presentation events." />
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="My previous evaluations" />
        {submissions.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Team</Th>
                <Th>Presentation</Th>
                <Th>Marks</Th>
                <Th>Submitted</Th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.presentationTeam.team.teamId}</Td>
                  <Td>{s.presentationTeam.presentation.name}</Td>
                  <Td className="tabular">
                    {s.totalMarks}/{s.maxMarks}
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(s.submittedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No evaluations yet" />
        )}
      </Card>
    </>
  );
}
