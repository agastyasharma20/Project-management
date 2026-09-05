import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";
import { isCollegeWide } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { JudgeManager } from "./judge-manager";

export const metadata = { title: "Judges" };

export default async function JudgesPage() {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["judge.manage"]);
  if (denied) return denied;

  const departmentFilter = isCollegeWide(principal)
    ? {}
    : { departmentId: { in: principal.departmentIds } };

  const [judges, faculty] = await Promise.all([
    db.user.findMany({
      where: { roles: { some: { role: "JUDGE" } }, facultyProfile: departmentFilter },
      include: {
        facultyProfile: { include: { department: { select: { code: true } } } },
        roles: true,
        _count: { select: { judgeAssignments: true, judgeSubmissions: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.facultyProfile.findMany({
      where: { ...departmentFilter, user: { roles: { none: { role: "JUDGE" } } } },
      include: { user: { select: { id: true, name: true, email: true } }, department: { select: { code: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Judges"
        description="A judge is a capability added to an existing faculty account — never a duplicate login."
      />

      <Card>
        <CardHeader title={`${judges.length} judge${judges.length === 1 ? "" : "s"}`} />
        {judges.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Department</Th>
                <Th>Other roles</Th>
                <Th>Assignments</Th>
                <Th>Evaluations</Th>
              </tr>
            </thead>
            <tbody>
              {judges.map((j) => (
                <tr key={j.id}>
                  <Td className="font-medium">{j.name}</Td>
                  <Td>{j.email}</Td>
                  <Td>{j.facultyProfile?.department.code ?? "—"}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {j.roles
                        .filter((r) => r.role !== "JUDGE")
                        .map((r) => (
                          <Badge key={r.id}>{r.role.replace(/_/g, " ").toLowerCase()}</Badge>
                        ))}
                    </span>
                  </Td>
                  <Td className="tabular">{j._count.judgeAssignments}</Td>
                  <Td className="tabular">{j._count.judgeSubmissions}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No judges yet" description="Grant the Judge capability to a faculty member below." />
        )}
      </Card>

      <div className="mt-4">
        <JudgeManager
          faculty={faculty.map((f) => ({
            value: f.user.id,
            label: `${f.user.name} · ${f.department.code}`,
          }))}
        />
      </div>
    </>
  );
}
