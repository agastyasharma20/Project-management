import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { RegisterTeamForm } from "./register-form";

export const metadata = { title: "Register your team" };

// Department, mentor and academic-year options are read live, so this page
// must not be captured at build time.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [departments, semesters, types, years, sections, mentors] = await Promise.all([
    db.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.semester.findMany({ where: { isActive: true }, orderBy: { number: "asc" } }),
    db.projectType.findMany({ where: { isActive: true } }),
    db.academicYear.findMany({ where: { isActive: true }, orderBy: { label: "desc" } }),
    db.section.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    db.facultyProfile.findMany({
      include: { user: { select: { id: true, name: true } }, department: { select: { id: true, code: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const academicConfigs = await db.academicConfiguration.findMany({
    select: { academicYearId: true, semesterId: true, projectTypeId: true },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        breadcrumb={
          <Link href="/login" className="hover:underline">
            Sign in
          </Link>
        }
        title="Register your project team"
        description="Only the team lead registers. A Team ID is issued after your mentor or HOD approves."
      />

      <RegisterTeamForm
        departments={departments.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }))}
        sections={sections.map((s) => ({ value: s.id, label: s.name, departmentId: s.departmentId }))}
        semesters={semesters.map((s) => ({ value: s.id, label: `Semester ${s.number}` }))}
        types={types.map((t) => ({ value: t.id, label: t.name }))}
        years={years.map((y) => ({ value: y.id, label: y.label, isCurrent: y.isCurrent }))}
        mentors={mentors.map((m) => ({ value: m.user.id, label: m.user.name, departmentId: m.department.id }))}
        academicConfigs={academicConfigs}
      />
    </div>
  );
}
