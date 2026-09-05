import Link from "next/link";
import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { db } from "@/lib/db";
import { teamScopeWhere } from "@/lib/services/teams";
import { computeTeamMetrics, filtersToWhere, rollup, summarise } from "@/lib/services/analytics";
import { getSetting } from "@/lib/services/settings";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  HealthPill,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ComparisonBarChart, DistributionChart } from "@/components/charts";
import { FilterBar } from "@/components/filter-bar";
import { formatPct, param, relativeDays } from "@/lib/utils";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["analytics.read.college", "analytics.read.department", "analytics.read.mentored"]);
  if (denied) return denied;
  const sp = await searchParams;

  const filters = {
    academicYearId: param(sp, "year"),
    departmentId: param(sp, "department"),
    semesterId: param(sp, "semester"),
    sectionId: param(sp, "section"),
    projectTypeId: param(sp, "type"),
    mentorUserId: param(sp, "mentor"),
  };
  const riskOnly = param(sp, "risk") === "AT_RISK";

  const where = filtersToWhere(filters, teamScopeWhere(principal));
  const all = await computeTeamMetrics(where);
  const metrics = riskOnly ? all.filter((m) => m.atRisk) : all;
  const totals = summarise(all);
  const [weights, riskRules] = await Promise.all([
    getSetting("analytics.healthWeights"),
    getSetting("analytics.riskRules"),
  ]);

  const byDepartment = rollup(all, (m) => ({ key: m.departmentId, label: m.departmentCode }));
  const distribution = [
    { label: "<50", count: all.filter((m) => m.healthScore < 50).length, tone: "danger" as const },
    { label: "50–74", count: all.filter((m) => m.healthScore >= 50 && m.healthScore < 75).length, tone: "warning" as const },
    { label: "75–89", count: all.filter((m) => m.healthScore >= 75 && m.healthScore < 90).length, tone: "info" as const },
    { label: "90+", count: all.filter((m) => m.healthScore >= 90).length, tone: "success" as const },
  ];

  const [years, departments, semesters, types, mentors] = await Promise.all([
    db.academicYear.findMany({ orderBy: { label: "desc" } }),
    db.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.semester.findMany({ orderBy: { number: "asc" } }),
    db.projectType.findMany({ where: { isActive: true } }),
    db.user.findMany({
      where: { roles: { some: { role: "FACULTY_MENTOR" } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Every figure is computed from live records — meetings, attendance snapshots and submitted evaluations."
        action={<ButtonLink href="/reports">Generate report</ButtonLink>}
      />

      <FilterBar
        basePath="/analytics"
        current={sp}
        fields={["year", "department", "semester", "type", "mentor", "risk"]}
        options={{
          year: years.map((y) => ({ value: y.id, label: y.label })),
          department: departments.map((d) => ({ value: d.id, label: d.code })),
          semester: semesters.map((s) => ({ value: s.id, label: `Semester ${s.number}` })),
          type: types.map((t) => ({ value: t.id, label: t.name })),
          mentor: mentors.map((m) => ({ value: m.id, label: m.name })),
          risk: [{ value: "AT_RISK", label: "At risk only" }],
        }}
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Projects" value={totals.teams} />
        <Stat label="Attendance" value={formatPct(totals.attendancePct, 1)} />
        <Stat label="Presentation" value={formatPct(totals.presentationPct, 1)} />
        <Stat label="Avg health" value={totals.healthScore} />
        <Stat label="At risk" value={totals.atRisk} tone={totals.atRisk ? "danger" : "success"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Department comparison" />
          <CardBody>
            {byDepartment.length ? (
              <ComparisonBarChart
                data={byDepartment.map((d) => ({
                  label: d.label,
                  attendance: Number((d.attendancePct ?? 0).toFixed(1)),
                  presentation: Number((d.presentationPct ?? 0).toFixed(1)),
                  health: d.healthScore,
                }))}
                xKey="label"
                domain={[0, 100]}
                bars={[
                  { key: "attendance", name: "Attendance %" },
                  { key: "presentation", name: "Presentation %" },
                  { key: "health", name: "Health" },
                ]}
              />
            ) : (
              <EmptyState title="No data" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Project health distribution"
            description={`Weights — meetings ${weights.meetingActivity}%, attendance ${weights.attendance}%, presentation ${weights.presentation}%, progress ${weights.progress}%, repository ${weights.repository}%`}
          />
          <CardBody>
            <DistributionChart data={distribution} />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={riskOnly ? "At-risk projects" : "Projects"}
          description={`Risk rules: no meeting for ${riskRules.maxDaysWithoutMeeting} days · attendance below ${riskRules.minAttendancePct}% · more than ${riskRules.maxRejectedMeetings} rejected submissions · presentation below ${riskRules.minPresentationPct}%`}
        />
        {metrics.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Team</Th>
                <Th>Dept</Th>
                <Th>Mentor</Th>
                <Th>Meetings</Th>
                <Th>Last</Th>
                <Th>Attendance</Th>
                <Th>Presentation</Th>
                <Th>Resources</Th>
                <Th>Health</Th>
                <Th>Risks</Th>
              </tr>
            </thead>
            <tbody>
              {metrics
                .sort((a, b) => a.healthScore - b.healthScore)
                .slice(0, 300)
                .map((m) => (
                  <tr key={m.teamId}>
                    <Td>
                      <Link href={`/teams/${m.teamId}`} className="font-medium text-[var(--color-brand-600)]">
                        {m.code}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {m.departmentCode}
                      {m.sectionName ? `-${m.sectionName}` : ""}
                    </Td>
                    <Td className="whitespace-nowrap">{m.mentorName ?? "—"}</Td>
                    <Td className="tabular">
                      {m.meetingsHeld}/{m.expectedMeetings}
                    </Td>
                    <Td className="whitespace-nowrap">{relativeDays(m.lastMeetingAt)}</Td>
                    <Td className="tabular">{formatPct(m.attendancePct, 0)}</Td>
                    <Td className="tabular">{formatPct(m.presentationPct, 0)}</Td>
                    <Td className="tabular">{formatPct(m.resourceCompletenessPct, 0)}</Td>
                    <Td>
                      <HealthPill score={m.healthScore} label={m.healthLabel} />
                    </Td>
                    <Td>
                      {m.risks.length ? (
                        <span className="flex flex-wrap gap-1">
                          {m.risks.map((r) => (
                            <Badge key={r} tone="danger">
                              {r}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <Badge tone="success">none</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nothing matches these filters" />
        )}
      </Card>
    </>
  );
}
