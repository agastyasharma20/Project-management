import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { db } from "@/lib/db";
import { teamScopeWhere } from "@/lib/services/teams";
import { computeTeamMetrics, filtersToWhere, meetingTrend, rollup, summarise } from "@/lib/services/analytics";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th } from "@/components/ui";
import { ComparisonBarChart, TrendLineChart } from "@/components/charts";
import { FilterBar } from "@/components/filter-bar";
import { ButtonLink } from "@/components/ui";
import { formatPct, param } from "@/lib/utils";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({
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
  };

  const where = filtersToWhere(filters, teamScopeWhere(principal));
  const [metrics, trend] = await Promise.all([computeTeamMetrics(where), meetingTrend(where, 12)]);
  const totals = summarise(metrics);

  const byDepartment = rollup(metrics, (m) => ({ key: m.departmentId, label: m.departmentCode }));
  const bySection = rollup(metrics, (m) =>
    m.sectionId ? { key: m.sectionId, label: `${m.departmentCode}-${m.sectionName}` } : null,
  );
  const bySemester = rollup(metrics, (m) => ({ key: String(m.semesterNumber), label: `Sem ${m.semesterNumber}` }));
  const byMentor = rollup(metrics, (m) => (m.mentorUserId ? { key: m.mentorUserId, label: m.mentorName ?? "—" } : null));

  const [years, departments, semesters, types, sections] = await Promise.all([
    db.academicYear.findMany({ orderBy: { label: "desc" } }),
    db.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.semester.findMany({ orderBy: { number: "asc" } }),
    db.projectType.findMany({ where: { isActive: true } }),
    filters.departmentId
      ? db.section.findMany({ where: { departmentId: filters.departmentId }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const exportParams = new URLSearchParams();
  for (const [key, raw] of Object.entries(sp)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) exportParams.set(key, value);
  }
  const exportQuery = exportParams.toString();

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Aggregated from immutable per-meeting attendance snapshots."
        action={
          <div className="flex gap-2">
            <ButtonLink href={`/api/reports/attendance?format=csv&${exportQuery}`}>CSV</ButtonLink>
            <ButtonLink href={`/api/reports/attendance?format=xlsx&${exportQuery}`}>Excel</ButtonLink>
          </div>
        }
      />

      <FilterBar
        basePath="/attendance"
        current={sp}
        fields={["year", "department", "semester", "section", "type"]}
        options={{
          year: years.map((y) => ({ value: y.id, label: y.label })),
          department: departments.map((d) => ({ value: d.id, label: d.code })),
          semester: semesters.map((s) => ({ value: s.id, label: `Semester ${s.number}` })),
          section: sections.map((s) => ({ value: s.id, label: s.name })),
          type: types.map((t) => ({ value: t.id, label: t.name })),
        }}
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Overall attendance" value={formatPct(totals.attendancePct, 1)} tone={(totals.attendancePct ?? 0) >= 80 ? "success" : "warning"} />
        <Stat label="Teams" value={totals.teams} />
        <Stat label="Students" value={totals.students} />
        <Stat label="Meetings" value={totals.meetings} />
      </div>

      <Card className="mt-4">
        <CardHeader title="Attendance trend" description="Weekly attendance across the filtered scope" />
        <CardBody>
          <TrendLineChart
            data={trend}
            xKey="label"
            lines={[
              { key: "attendancePct", name: "Attendance %" },
              { key: "meetings", name: "Meetings" },
            ]}
          />
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="By department" />
          <CardBody>
            {byDepartment.length ? (
              <ComparisonBarChart
                data={byDepartment.map((d) => ({ label: d.label, attendance: Number((d.attendancePct ?? 0).toFixed(1)) }))}
                xKey="label"
                domain={[0, 100]}
                bars={[{ key: "attendance", name: "Attendance %" }]}
              />
            ) : (
              <EmptyState title="No data" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="By section" />
          {bySection.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Section</Th>
                  <Th>Teams</Th>
                  <Th>Students</Th>
                  <Th>Attendance</Th>
                  <Th>At risk</Th>
                </tr>
              </thead>
              <tbody>
                {bySection.map((s) => (
                  <tr key={s.key}>
                    <Td className="font-medium">{s.label}</Td>
                    <Td className="tabular">{s.teams}</Td>
                    <Td className="tabular">{s.students}</Td>
                    <Td className="tabular">{formatPct(s.attendancePct, 1)}</Td>
                    <Td className="tabular">{s.atRisk}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No sections in scope" />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="By semester" />
          <Table>
            <thead>
              <tr>
                <Th>Semester</Th>
                <Th>Teams</Th>
                <Th>Attendance</Th>
                <Th>Health</Th>
              </tr>
            </thead>
            <tbody>
              {bySemester.map((s) => (
                <tr key={s.key}>
                  <Td className="font-medium">{s.label}</Td>
                  <Td className="tabular">{s.teams}</Td>
                  <Td className="tabular">{formatPct(s.attendancePct, 1)}</Td>
                  <Td className="tabular">{s.healthScore}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="By faculty mentor" description="Project monitoring activity, not a performance ranking." />
          <Table>
            <thead>
              <tr>
                <Th>Mentor</Th>
                <Th>Teams</Th>
                <Th>Meetings</Th>
                <Th>Attendance</Th>
                <Th>At risk</Th>
              </tr>
            </thead>
            <tbody>
              {byMentor.map((m) => (
                <tr key={m.key}>
                  <Td className="font-medium">{m.label}</Td>
                  <Td className="tabular">{m.teams}</Td>
                  <Td className="tabular">{m.meetings}</Td>
                  <Td className="tabular">{formatPct(m.attendancePct, 1)}</Td>
                  <Td className="tabular">{m.atRisk}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
