import Link from "next/link";
import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";
import { can, isCollegeWide } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { CreatePresentationForm } from "./create-form";

export const metadata = { title: "Presentations" };

export default async function PresentationsPage() {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["presentation.read"]);
  if (denied) return denied;

  const departmentFilter = isCollegeWide(principal)
    ? {}
    : principal.roles.includes("HOD")
      ? { OR: [{ departmentId: { in: principal.departmentIds } }, { departmentId: null }] }
      : {};

  const presentations = await db.presentation.findMany({
    where: departmentFilter,
    orderBy: { scheduledOn: "desc" },
    include: {
      department: { select: { code: true } },
      semester: { select: { number: true } },
      scheme: { select: { name: true, totalMarks: true } },
      _count: { select: { teams: true, judges: true } },
    },
  });

  const canWrite = can(principal, "presentation.write");

  const [years, departments, semesters, types, schemes] = canWrite
    ? await Promise.all([
        db.academicYear.findMany({ orderBy: { label: "desc" } }),
        db.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
        db.semester.findMany({ orderBy: { number: "asc" } }),
        db.projectType.findMany({ where: { isActive: true } }),
        db.markingScheme.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      ])
    : [[], [], [], [], []];

  return (
    <>
      <PageHeader title="Presentations" description="Schedule events, assign judges and control marks release." />

      <Card>
        <CardHeader title={`${presentations.length} event${presentations.length === 1 ? "" : "s"}`} />
        {presentations.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th>Scope</Th>
                <Th>Date</Th>
                <Th>Venue</Th>
                <Th>Scheme</Th>
                <Th>Teams</Th>
                <Th>Judges</Th>
                <Th>Marks</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {presentations.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/presentations/${p.id}`} className="font-medium text-[var(--color-brand-600)]">
                      {p.name}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {p.department?.code ?? "All departments"}
                    {p.semester ? ` · S${p.semester.number}` : ""}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatDate(p.scheduledOn)}
                    {p.startTime ? ` · ${p.startTime}` : ""}
                  </Td>
                  <Td>{p.venue ?? "—"}</Td>
                  <Td>{p.scheme ? `${p.scheme.name} (${p.scheme.totalMarks})` : "Not attached"}</Td>
                  <Td className="tabular">{p._count.teams}</Td>
                  <Td className="tabular">{p._count.judges}</Td>
                  <Td>
                    <StatusBadge status={p.marksVisibility} />
                  </Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No presentation events yet" description="Create the first event to start scheduling teams." />
        )}
      </Card>

      {canWrite ? (
        <div className="mt-4">
          <CreatePresentationForm
            options={{
              years: years.map((y) => ({ value: y.id, label: y.label })),
              departments: departments.map((d) => ({ value: d.id, label: d.code })),
              semesters: semesters.map((s) => ({ value: s.id, label: `Semester ${s.number}` })),
              types: types.map((t) => ({ value: t.id, label: t.name })),
              schemes: schemes.map((s) => ({ value: s.id, label: `${s.name} (${s.totalMarks})` })),
            }}
          />
        </div>
      ) : null}
    </>
  );
}
