import { requirePrincipal } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, EmptyState, InfoNote, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My marks" };

/**
 * Students see aggregate marks only for presentations whose visibility is
 * PUBLISHED. Individual judge identities and unpublished scores are withheld.
 */
export default async function MyMarksPage() {
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
        <PageHeader title="Marks" />
        <Card>
          <EmptyState title="You are not in a team yet" />
        </Card>
      </>
    );
  }

  const slots = await db.presentationTeam.findMany({
    where: { teamId: membership.teamId, presentation: { marksVisibility: "PUBLISHED" } },
    include: {
      presentation: { include: { scheme: { include: { criteria: { orderBy: { sortOrder: "asc" } } } } } },
      submissions: { where: { status: "SUBMITTED" }, include: { marks: true } },
    },
    orderBy: { presentation: { scheduledOn: "asc" } },
  });

  const pending = await db.presentationTeam.count({
    where: { teamId: membership.teamId, presentation: { marksVisibility: { not: "PUBLISHED" } } },
  });

  return (
    <>
      <PageHeader
        title="Presentation marks"
        description={`${membership.team.teamId} · ${membership.team.projectTitle}`}
      />

      {pending ? (
        <div className="mb-4">
          <InfoNote>
            {pending} evaluation{pending === 1 ? " is" : "s are"} not published yet. Marks appear here once your
            department releases them.
          </InfoNote>
        </div>
      ) : null}

      <div className="space-y-4">
        {slots.length ? (
          slots.map((slot) => {
            const totals = slot.submissions.map((s) => s.totalMarks);
            const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
            const max = slot.presentation.scheme?.totalMarks ?? slot.submissions[0]?.maxMarks ?? 0;

            const perCriterion = (slot.presentation.scheme?.criteria ?? []).map((c) => {
              const values = slot.submissions.flatMap((s) =>
                s.marks.filter((m) => m.criterionId === c.id).map((m) => m.value),
              );
              return {
                label: c.label,
                max: c.maxMarks,
                average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
              };
            });

            return (
              <Card key={slot.id}>
                <CardHeader
                  title={slot.presentation.name}
                  description={`${formatDate(slot.presentation.scheduledOn)} · evaluated by ${slot.submissions.length} judge(s)`}
                />
                <CardBody>
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Average" value={avg === null ? "—" : `${avg.toFixed(1)}/${max}`} />
                    <Stat
                      label="Percentage"
                      value={avg === null || !max ? "—" : `${((avg / max) * 100).toFixed(1)}%`}
                      tone="brand"
                    />
                    <Stat label="Highest" value={totals.length ? Math.max(...totals) : "—"} />
                    <Stat label="Lowest" value={totals.length ? Math.min(...totals) : "—"} />
                  </div>

                  {perCriterion.length ? (
                    <Table>
                      <thead>
                        <tr>
                          <Th>Criterion</Th>
                          <Th>Average</Th>
                          <Th>Maximum</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {perCriterion.map((c) => (
                          <tr key={c.label}>
                            <Td className="font-medium">{c.label}</Td>
                            <Td className="tabular">{c.average === null ? "—" : c.average.toFixed(1)}</Td>
                            <Td className="tabular">{c.max}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  ) : null}
                </CardBody>
              </Card>
            );
          })
        ) : (
          <Card>
            <EmptyState title="No published marks yet" />
          </Card>
        )}
      </div>
    </>
  );
}
