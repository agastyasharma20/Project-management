import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";
import { isCollegeWide } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { SchemeForm } from "./scheme-form";

export const metadata = { title: "Marking schemes" };

export default async function SchemesPage() {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["scheme.write"]);
  if (denied) return denied;

  const schemes = await db.markingScheme.findMany({
    where: isCollegeWide(principal)
      ? {}
      : { OR: [{ departmentId: { in: principal.departmentIds } }, { departmentId: null }] },
    include: {
      criteria: { orderBy: { sortOrder: "asc" } },
      department: { select: { code: true } },
      projectType: { select: { name: true } },
      _count: { select: { presentations: true } },
    },
    orderBy: { name: "asc" },
  });

  const [departments, types] = await Promise.all([
    db.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.projectType.findMany({ where: { isActive: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Marking schemes"
        description="Criteria, maximum marks and weights are fully configurable. Totals are validated on save."
      />

      <div className="space-y-4">
        {schemes.length ? (
          schemes.map((scheme) => (
            <Card key={scheme.id}>
              <CardHeader
                title={scheme.name}
                description={`${scheme.department?.code ?? "All departments"} · ${
                  scheme.projectType?.name ?? "All project types"
                } · used by ${scheme._count.presentations} event(s)`}
                action={<Badge tone="brand">Total {scheme.totalMarks}</Badge>}
              />
              <Table>
                <thead>
                  <tr>
                    <Th>Criterion</Th>
                    <Th>Description</Th>
                    <Th>Max</Th>
                    <Th>Weight</Th>
                  </tr>
                </thead>
                <tbody>
                  {scheme.criteria.map((c) => (
                    <tr key={c.id}>
                      <Td className="font-medium">{c.label}</Td>
                      <Td className="text-[var(--color-muted)]">{c.description ?? "—"}</Td>
                      <Td className="tabular">{c.maxMarks}</Td>
                      <Td className="tabular">{c.weight}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ))
        ) : (
          <Card>
            <EmptyState title="No marking schemes yet" description="Create one below and attach it to a presentation." />
          </Card>
        )}
      </div>

      <div className="mt-4">
        <SchemeForm
          departments={departments.map((d) => ({ value: d.id, label: d.code }))}
          types={types.map((t) => ({ value: t.id, label: t.name }))}
        />
      </div>
    </>
  );
}
