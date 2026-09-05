import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";
import { can, canAccessDepartment } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { criterionAverages, presentationResults } from "@/lib/services/evaluation";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { ComparisonBarChart } from "@/components/charts";
import { formatDate } from "@/lib/utils";
import { PresentationAdminPanel } from "./admin-panel";

export default async function PresentationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["presentation.read"]);
  if (denied) return denied;
  const { id } = await params;

  const presentation = await db.presentation.findUnique({
    where: { id },
    include: {
      department: { select: { code: true } },
      semester: { select: { number: true } },
      projectType: { select: { name: true } },
      academicYear: { select: { label: true } },
      scheme: { include: { criteria: { orderBy: { sortOrder: "asc" } } } },
      judges: { include: { judge: { select: { id: true, name: true, email: true } } } },
      teams: {
        include: { team: { select: { id: true, teamId: true, projectTitle: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!presentation) notFound();
  if (presentation.departmentId && !canAccessDepartment(principal, presentation.departmentId)) notFound();

  const canWrite = can(principal, "presentation.write");
  const canSeeMarks = can(principal, "marks.read.all");

  const [results, criteria] = canSeeMarks
    ? await Promise.all([presentationResults(presentation.id), criterionAverages(presentation.id)])
    : [[], []];

  const evaluated = results.filter((r) => r.judgeCount > 0);
  const averagePct = evaluated.length
    ? (evaluated.reduce((s, r) => s + (r.average ?? 0) / (r.maxMarks || 1), 0) / evaluated.length) * 100
    : null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/presentations" className="hover:underline">
            Presentations
          </Link>
        }
        title={presentation.name}
        description={`${formatDate(presentation.scheduledOn)}${presentation.startTime ? ` · ${presentation.startTime}` : ""}${
          presentation.venue ? ` · ${presentation.venue}` : ""
        }`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge status={presentation.status} />
        <Badge tone="brand">Marks: {presentation.marksVisibility.toLowerCase()}</Badge>
        <Badge>{presentation.department?.code ?? "All departments"}</Badge>
        {presentation.semester ? <Badge>Semester {presentation.semester.number}</Badge> : null}
        {presentation.projectType ? <Badge>{presentation.projectType.name}</Badge> : null}
        <Badge>{presentation.academicYear.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Teams scheduled" value={presentation.teams.length} />
        <Stat label="Judges assigned" value={presentation.judges.length} />
        <Stat label="Teams evaluated" value={evaluated.length} />
        <Stat label="Average score" value={averagePct === null ? "—" : `${averagePct.toFixed(1)}%`} />
      </div>

      {canSeeMarks && criteria.length ? (
        <Card className="mt-4">
          <CardHeader title="Criterion performance" description="Average marks as a share of the maximum" />
          <CardBody>
            <ComparisonBarChart
              data={criteria.map((c) => ({ label: c.label, pct: Number(c.pct.toFixed(1)) }))}
              xKey="label"
              domain={[0, 100]}
              bars={[{ key: "pct", name: "% of maximum" }]}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader title="Scheduled teams" />
        {presentation.teams.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Team</Th>
                <Th>Project</Th>
                <Th>Slot</Th>
                {canSeeMarks ? (
                  <>
                    <Th>Judges</Th>
                    <Th>Average</Th>
                    <Th>High</Th>
                    <Th>Low</Th>
                    <Th>Median</Th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {presentation.teams.map((slot) => {
                const r = results.find((x) => x.presentationTeamId === slot.id);
                return (
                  <tr key={slot.id}>
                    <Td>
                      <Link href={`/teams/${slot.team.id}`} className="font-medium text-[var(--color-brand-600)]">
                        {slot.team.teamId}
                      </Link>
                    </Td>
                    <Td className="max-w-[18rem] truncate">{slot.team.projectTitle}</Td>
                    <Td>{slot.slotTime ?? "—"}</Td>
                    {canSeeMarks ? (
                      <>
                        <Td className="tabular">{r?.judgeCount ?? 0}</Td>
                        <Td className="tabular">{r?.average?.toFixed(1) ?? "—"}</Td>
                        <Td className="tabular">{r?.highest ?? "—"}</Td>
                        <Td className="tabular">{r?.lowest ?? "—"}</Td>
                        <Td className="tabular">{r?.median?.toFixed(1) ?? "—"}</Td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No teams scheduled yet" />
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Judges" />
        {presentation.judges.length ? (
          <ul className="divide-y divide-[var(--color-line)]">
            {presentation.judges.map((j) => (
              <li key={j.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span>{j.judge.name}</span>
                <span className="text-[var(--color-muted)]">{j.judge.email}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No judges assigned" />
        )}
      </Card>

      {canWrite ? (
        <div className="mt-4">
          <PresentationAdminPanel
            presentationId={presentation.id}
            marksVisibility={presentation.marksVisibility}
            judges={(
              await db.user.findMany({
                where: {
                  roles: { some: { role: "JUDGE" } },
                  ...(presentation.departmentId
                    ? { facultyProfile: { departmentId: presentation.departmentId } }
                    : {}),
                },
                select: { id: true, name: true },
                orderBy: { name: "asc" },
              })
            ).map((u) => ({ value: u.id, label: u.name }))}
          />
        </div>
      ) : null}
    </>
  );
}
