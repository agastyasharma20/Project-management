import Link from "next/link";
import { db } from "@/lib/db";
import type { Principal } from "@/lib/auth/rbac";
import { isCollegeWide } from "@/lib/auth/rbac";
import {
  computeTeamMetrics,
  meetingTrend,
  rollup,
  summarise,
} from "@/lib/services/analytics";
import { teamScopeWhere } from "@/lib/services/teams";
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
import { ComparisonBarChart, TrendLineChart } from "@/components/charts";
import { formatPct, relativeDays } from "@/lib/utils";

export async function AdminDashboard({ principal }: { principal: Principal }) {
  const scope = teamScopeWhere(principal);
  const collegeWide = isCollegeWide(principal);

  const [metrics, trend, pendingRegistrations, pendingMeetings, upcoming, counts] = await Promise.all([
    computeTeamMetrics({ AND: [scope, { registrationStatus: "APPROVED" }] }),
    meetingTrend(scope, 10),
    db.team.count({ where: { AND: [scope, { registrationStatus: "SUBMITTED" }] } }),
    db.meeting.count({ where: { team: scope, status: "PENDING_APPROVAL" } }),
    db.presentation.findMany({
      where: {
        scheduledOn: { gte: new Date() },
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        ...(collegeWide ? {} : { departmentId: { in: principal.departmentIds } }),
      },
      orderBy: { scheduledOn: "asc" },
      take: 5,
      include: { department: { select: { code: true } }, _count: { select: { teams: true, judges: true } } },
    }),
    Promise.all([
      db.department.count({ where: { isActive: true } }),
      db.studentProfile.count({
        where: collegeWide ? {} : { departmentId: { in: principal.departmentIds } },
      }),
      db.facultyProfile.count({
        where: collegeWide ? {} : { departmentId: { in: principal.departmentIds } },
      }),
    ]),
  ]);

  const [departments, students, faculty] = counts;
  const totals = summarise(metrics);
  const byDepartment = rollup(metrics, (m) => ({ key: m.departmentId, label: m.departmentCode }));
  const bySemester = rollup(metrics, (m) => ({
    key: String(m.semesterNumber),
    label: `Sem ${m.semesterNumber}`,
  }));
  const minor = metrics.filter((m) => m.projectTypeCode === "MINOR").length;
  const major = metrics.filter((m) => m.projectTypeCode === "MAJOR").length;
  const atRisk = metrics.filter((m) => m.atRisk).sort((a, b) => a.healthScore - b.healthScore);

  return (
    <>
      <PageHeader
        title={collegeWide ? "College overview" : "Department overview"}
        description={
          collegeWide
            ? "Every department, academic year and project under one view."
            : `Scope: ${principal.departmentIds.length} department(s) you head.`
        }
        action={
          <div className="flex gap-2">
            <ButtonLink href="/reports">Reports</ButtonLink>
            <ButtonLink href="/analytics" variant="primary">
              Open analytics
            </ButtonLink>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active projects" value={totals.teams} sub={`${minor} minor · ${major} major`} />
        <Stat
          label="Average attendance"
          value={formatPct(totals.attendancePct, 1)}
          sub={`${totals.meetings} meetings recorded`}
          tone={(totals.attendancePct ?? 0) >= 80 ? "success" : "warning"}
        />
        <Stat
          label="Average presentation"
          value={formatPct(totals.presentationPct, 1)}
          sub="Across submitted judge evaluations"
        />
        <Stat
          label="At-risk projects"
          value={totals.atRisk}
          sub="Rules-based detection"
          tone={totals.atRisk > 0 ? "danger" : "success"}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Departments" value={departments} />
        <Stat label="Students" value={students} />
        <Stat label="Faculty" value={faculty} />
        <Stat
          label="Awaiting action"
          value={pendingRegistrations + pendingMeetings}
          sub={`${pendingRegistrations} registrations · ${pendingMeetings} meetings`}
          tone={pendingRegistrations + pendingMeetings > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Department comparison"
            description="Average attendance and project health by department"
          />
          <CardBody>
            {byDepartment.length ? (
              <ComparisonBarChart
                data={byDepartment.map((d) => ({
                  label: d.label,
                  attendance: d.attendancePct ? Number(d.attendancePct.toFixed(1)) : 0,
                  health: d.healthScore,
                }))}
                xKey="label"
                domain={[0, 100]}
                bars={[
                  { key: "attendance", name: "Attendance %" },
                  { key: "health", name: "Health score" },
                ]}
              />
            ) : (
              <EmptyState title="No approved projects yet" description="Metrics appear once registrations are approved." />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Meeting activity" description="Recorded meetings and attendance by week" />
          <CardBody>
            <TrendLineChart
              data={trend}
              xKey="label"
              lines={[
                { key: "meetings", name: "Meetings" },
                { key: "attendancePct", name: "Attendance %" },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="At-risk projects"
            description="Transparent rule matches — configure thresholds in Configuration › Analytics"
            action={<ButtonLink size="sm" href="/analytics">View all</ButtonLink>}
          />
          {atRisk.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Team</Th>
                  <Th>Mentor</Th>
                  <Th>Reasons</Th>
                  <Th>Last meeting</Th>
                  <Th>Health</Th>
                </tr>
              </thead>
              <tbody>
                {atRisk.slice(0, 8).map((m) => (
                  <tr key={m.teamId}>
                    <Td>
                      <Link href={`/teams/${m.teamId}`} className="font-medium text-[var(--color-brand-600)]">
                        {m.code}
                      </Link>
                      <span className="block max-w-[16rem] truncate text-[12px] text-[var(--color-muted)]">
                        {m.projectTitle}
                      </span>
                    </Td>
                    <Td>{m.mentorName ?? "—"}</Td>
                    <Td>
                      <ul className="space-y-0.5">
                        {m.risks.map((r) => (
                          <li key={r} className="text-[12px] text-[var(--color-danger)]">
                            • {r}
                          </li>
                        ))}
                      </ul>
                    </Td>
                    <Td className="tabular whitespace-nowrap">{relativeDays(m.lastMeetingAt)}</Td>
                    <Td>
                      <HealthPill score={m.healthScore} label={m.healthLabel} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No at-risk projects" description="Every team is meeting the configured thresholds." />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Upcoming presentations" />
            {upcoming.length ? (
              <ul className="divide-y divide-[var(--color-line)]">
                {upcoming.map((p) => (
                  <li key={p.id} className="px-4 py-3">
                    <Link href={`/presentations/${p.id}`} className="text-[13px] font-medium">
                      {p.name}
                    </Link>
                    <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
                      {new Date(p.scheduledOn).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      {p.startTime ? ` · ${p.startTime}` : ""} · {p.department?.code ?? "All departments"}
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                      {p._count.teams} teams · {p._count.judges} judges
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing scheduled" description="Create a presentation event to schedule teams." />
            )}
          </Card>

          <Card>
            <CardHeader title="Semester mix" />
            <CardBody className="space-y-2">
              {bySemester.length ? (
                bySemester.map((s) => (
                  <div key={s.key} className="flex items-center justify-between text-[13px]">
                    <span>{s.label}</span>
                    <span className="flex items-center gap-2">
                      <Badge>{s.teams} teams</Badge>
                      <span className="tabular text-[var(--color-muted)]">{formatPct(s.attendancePct, 0)}</span>
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-[var(--color-muted)]">No data yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
