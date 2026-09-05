import Link from "next/link";
import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";
import { isCollegeWide } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { presentationResults } from "@/lib/services/evaluation";
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { DistributionChart } from "@/components/charts";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Results" };

export default async function ResultsPage() {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["marks.read.all"]);
  if (denied) return denied;

  const presentations = await db.presentation.findMany({
    where: isCollegeWide(principal)
      ? {}
      : { OR: [{ departmentId: { in: principal.departmentIds } }, { departmentId: null }] },
    orderBy: { scheduledOn: "desc" },
    take: 20,
    include: { department: { select: { code: true } } },
  });

  const rows = await Promise.all(
    presentations.map(async (p) => ({ presentation: p, results: await presentationResults(p.id) })),
  );

  const allPct = rows
    .flatMap((r) => r.results)
    .filter((r) => r.average !== null && r.maxMarks > 0)
    .map((r) => ((r.average as number) / r.maxMarks) * 100);

  const distribution = [
    { label: "<50", count: allPct.filter((p) => p < 50).length, tone: "danger" as const },
    { label: "50–64", count: allPct.filter((p) => p >= 50 && p < 65).length, tone: "warning" as const },
    { label: "65–79", count: allPct.filter((p) => p >= 65 && p < 80).length, tone: "info" as const },
    { label: "80+", count: allPct.filter((p) => p >= 80).length, tone: "success" as const },
  ];

  return (
    <>
      <PageHeader
        title="Presentation results"
        description="Aggregates across judges. Each judge's original submission is preserved unchanged."
      />

      {allPct.length ? (
        <Card className="mb-4">
          <CardHeader title="Score distribution" description={`${allPct.length} evaluated team-events`} />
          <div className="p-4">
            <DistributionChart data={distribution} />
          </div>
        </Card>
      ) : null}

      <div className="space-y-4">
        {rows.length ? (
          rows.map(({ presentation, results }) => (
            <Card key={presentation.id}>
              <CardHeader
                title={
                  <Link href={`/presentations/${presentation.id}`} className="text-[var(--color-brand-600)]">
                    {presentation.name}
                  </Link>
                }
                description={`${formatDate(presentation.scheduledOn)} · ${presentation.department?.code ?? "All departments"}`}
                action={<StatusBadge status={presentation.marksVisibility} />}
              />
              {results.some((r) => r.judgeCount > 0) ? (
                <Table>
                  <thead>
                    <tr>
                      <Th>Team</Th>
                      <Th>Project</Th>
                      <Th>Judges</Th>
                      <Th>Average</Th>
                      <Th>Highest</Th>
                      <Th>Lowest</Th>
                      <Th>Per judge</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {results
                      .filter((r) => r.judgeCount > 0)
                      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0))
                      .map((r) => (
                        <tr key={r.presentationTeamId}>
                          <Td className="font-medium">{r.teamCode}</Td>
                          <Td className="max-w-[16rem] truncate">{r.projectTitle}</Td>
                          <Td className="tabular">{r.judgeCount}</Td>
                          <Td className="tabular">
                            {r.average?.toFixed(1)}/{r.maxMarks}
                          </Td>
                          <Td className="tabular">{r.highest}</Td>
                          <Td className="tabular">{r.lowest}</Td>
                          <Td className="text-[12px] text-[var(--color-muted)]">
                            {r.perJudge.map((j) => `${j.judge}: ${j.total}`).join(" · ")}
                          </Td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              ) : (
                <EmptyState title="No submitted evaluations yet" />
              )}
            </Card>
          ))
        ) : (
          <Card>
            <EmptyState title="No presentations" />
          </Card>
        )}
      </div>
    </>
  );
}
