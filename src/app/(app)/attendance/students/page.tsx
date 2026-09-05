import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { db } from "@/lib/db";
import { teamScopeWhere } from "@/lib/services/teams";
import { filtersToWhere, studentAttendance } from "@/lib/services/analytics";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { formatPct, param } from "@/lib/utils";

export const metadata = { title: "Student attendance" };

export default async function StudentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["analytics.read.college", "analytics.read.department", "analytics.read.mentored"]);
  if (denied) return denied;
  const sp = await searchParams;

  const where = filtersToWhere(
    {
      academicYearId: param(sp, "year"),
      departmentId: param(sp, "department"),
      semesterId: param(sp, "semester"),
      sectionId: param(sp, "section"),
      projectTypeId: param(sp, "type"),
    },
    teamScopeWhere(principal),
  );

  const teams = await db.team.findMany({ where, select: { id: true } });
  const rows = await studentAttendance(teams.map((t) => t.id));
  const q = param(sp, "q")?.toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.enrollmentNo.toLowerCase().includes(q))
    : rows;

  const [years, departments, semesters, types] = await Promise.all([
    db.academicYear.findMany({ orderBy: { label: "desc" } }),
    db.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.semester.findMany({ orderBy: { number: "asc" } }),
    db.projectType.findMany({ where: { isActive: true } }),
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
        title="Student attendance"
        description="Lowest attendance first, so the students who need attention appear at the top."
        action={<ButtonLink href={`/api/reports/attendance?format=csv&scope=students&${exportQuery}`}>Export CSV</ButtonLink>}
      />

      <FilterBar
        basePath="/attendance/students"
        current={sp}
        fields={["q", "year", "department", "semester", "type"]}
        options={{
          year: years.map((y) => ({ value: y.id, label: y.label })),
          department: departments.map((d) => ({ value: d.id, label: d.code })),
          semester: semesters.map((s) => ({ value: s.id, label: `Semester ${s.number}` })),
          type: types.map((t) => ({ value: t.id, label: t.name })),
        }}
      />

      <Card className="mt-4">
        <CardHeader title={`${filtered.length} student${filtered.length === 1 ? "" : "s"}`} />
        {filtered.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Enrollment</Th>
                <Th>Team</Th>
                <Th>Present</Th>
                <Th>Meetings</Th>
                <Th>Attendance</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((s) => (
                <tr key={s.studentId}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td>{s.enrollmentNo}</Td>
                  <Td>{s.teamCode ?? "—"}</Td>
                  <Td className="tabular">{s.present}</Td>
                  <Td className="tabular">{s.total}</Td>
                  <Td>
                    <Badge tone={(s.pct ?? 0) >= 75 ? "success" : (s.pct ?? 0) >= 60 ? "warning" : "danger"}>
                      {formatPct(s.pct, 1)}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No attendance records in this scope" />
        )}
      </Card>
    </>
  );
}
