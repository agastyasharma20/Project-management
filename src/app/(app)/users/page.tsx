import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";
import { can, isCollegeWide } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/domain/constants";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { formatDate, pageFrom, param } from "@/lib/utils";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";

export const metadata = { title: "Users" };

const PAGE_SIZE = 25;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["user.read"]);
  if (denied) return denied;
  const sp = await searchParams;
  const q = param(sp, "q");
  const role = param(sp, "role");

  const scopeFilter = isCollegeWide(principal)
    ? {}
    : {
        OR: [
          { studentProfile: { departmentId: { in: principal.departmentIds } } },
          { facultyProfile: { departmentId: { in: principal.departmentIds } } },
        ],
      };

  const where = {
    AND: [
      scopeFilter,
      role ? { roles: { some: { role } } } : {},
      q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { studentProfile: { enrollmentNo: { contains: q } } },
              { facultyProfile: { employeeCode: { contains: q } } },
            ],
          }
        : {},
    ],
  };

  const { page, skip, take } = pageFrom(sp, PAGE_SIZE);
  const [total, users, departments, sections, semesters] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      skip,
      take,
      orderBy: { name: "asc" },
      include: {
        roles: true,
        studentProfile: { include: { department: { select: { code: true } }, section: true } },
        facultyProfile: { include: { department: { select: { code: true } } } },
      },
    }),
    db.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.section.findMany({ orderBy: { name: "asc" }, include: { department: { select: { code: true } } } }),
    db.semester.findMany({ orderBy: { number: "asc" } }),
  ]);

  const canWrite = can(principal, "user.write");

  return (
    <>
      <PageHeader title="Users" description="Students, faculty, HODs, judges and administrators." />

      <form className="mb-4 flex flex-wrap gap-2" action="/users">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Name, email, enrollment or employee code"
          className="h-9 min-w-[14rem] flex-1 rounded-lg border border-[var(--color-line-strong)] px-3 text-[13px]"
        />
        <select
          name="role"
          defaultValue={role ?? ""}
          aria-label="Role"
          className="h-9 rounded-lg border border-[var(--color-line-strong)] bg-white px-3 text-[13px]"
        >
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-lg border border-[var(--color-line-strong)] bg-white px-3 text-[13px]">
          Apply
        </button>
      </form>

      <Card>
        <CardHeader title={`${total} user${total === 1 ? "" : "s"}`} />
        {users.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Roles</Th>
                  <Th>Department</Th>
                  <Th>Identifier</Th>
                  <Th>Last sign-in</Th>
                  <Th>Status</Th>
                  {canWrite ? <Th /> : null}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <Td className="font-medium">{user.name}</Td>
                    <Td>{user.email}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {user.roles.map((r) => (
                          <Badge key={r.id} tone={r.role === "SUPER_ADMIN" ? "brand" : "neutral"}>
                            {ROLE_LABELS[r.role as Role] ?? r.role}
                          </Badge>
                        ))}
                      </span>
                    </Td>
                    <Td>
                      {user.facultyProfile?.department.code ?? user.studentProfile?.department.code ?? "—"}
                    </Td>
                    <Td>{user.studentProfile?.enrollmentNo ?? user.facultyProfile?.employeeCode ?? "—"}</Td>
                    <Td className="whitespace-nowrap">{formatDate(user.lastLoginAt)}</Td>
                    <Td>
                      <Badge tone={user.isActive ? "success" : "danger"}>
                        {user.isActive ? "active" : "disabled"}
                      </Badge>
                    </Td>
                    {canWrite ? (
                      <Td className="text-right">
                        <UserRowActions userId={user.id} isActive={user.isActive} />
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/users" query={{ q, role }} />
          </>
        ) : (
          <EmptyState title="No users found" />
        )}
      </Card>

      {canWrite ? (
        <div className="mt-4">
          <CreateUserForm
            collegeWide={isCollegeWide(principal)}
            departments={departments.map((d) => ({ value: d.id, label: d.code }))}
            sections={sections.map((s) => ({ value: s.id, label: `${s.department.code}-${s.name}` }))}
            semesters={semesters.map((s) => ({ value: s.id, label: `Semester ${s.number}` }))}
          />
        </div>
      ) : null}
    </>
  );
}
