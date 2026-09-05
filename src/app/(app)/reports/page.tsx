import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, InfoNote, PageHeader } from "@/components/ui";
import { ReportBuilder } from "./report-builder";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["report.generate"]);
  if (denied) return denied;

  const [years, departments, semesters, types, mentors] = await Promise.all([
    db.academicYear.findMany({ orderBy: { label: "desc" } }),
    db.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.semester.findMany({ orderBy: { number: "asc" } }),
    db.projectType.findMany({ where: { isActive: true } }),
    db.user.findMany({
      where: { roles: { some: { role: "FACULTY_MENTOR" } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Filtered exports in CSV and Excel. Every export is scoped to what you are allowed to see."
      />

      <ReportBuilder
        canSeeMarks={can(principal, "marks.read.all")}
        options={{
          years: years.map((y) => ({ value: y.id, label: y.label })),
          departments: departments.map((d) => ({ value: d.id, label: d.code })),
          semesters: semesters.map((s) => ({ value: s.id, label: `Semester ${s.number}` })),
          types: types.map((t) => ({ value: t.id, label: t.name })),
          mentors: mentors.map((m) => ({ value: m.id, label: m.name })),
        }}
      />

      <Card className="mt-4">
        <CardHeader title="Printable reports" description="Use your browser's print dialog to save as PDF." />
        <CardBody className="space-y-3 text-[13px]">
          <InfoNote>
            Team, faculty, department and semester reports render as print-optimised pages. Open a team workspace
            and print it, or export the tabular data above for spreadsheets. Layout chrome is hidden when printing.
          </InfoNote>
        </CardBody>
      </Card>
    </>
  );
}
