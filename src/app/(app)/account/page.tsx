import { requirePrincipal } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/domain/constants";
import { permissionsFor } from "@/lib/auth/rbac";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const principal = await requirePrincipal();

  const user = await db.user.findUniqueOrThrow({
    where: { id: principal.userId },
    include: {
      roles: { include: { department: { select: { code: true } } } },
      studentProfile: { include: { department: true, section: true, semester: true } },
      facultyProfile: { include: { department: true } },
      sessions: { where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  const permissions = [...permissionsFor(principal.roles)].sort();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My account" description={user.email} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="space-y-2 text-[13px]">
            <p>
              <span className="text-[var(--color-muted)]">Name: </span>
              {user.name}
            </p>
            <p>
              <span className="text-[var(--color-muted)]">Phone: </span>
              {user.phone ?? "—"}
            </p>
            {user.studentProfile ? (
              <p>
                <span className="text-[var(--color-muted)]">Student: </span>
                {user.studentProfile.enrollmentNo} · {user.studentProfile.department.code}
                {user.studentProfile.section ? `-${user.studentProfile.section.name}` : ""}
                {user.studentProfile.semester ? ` · Semester ${user.studentProfile.semester.number}` : ""}
              </p>
            ) : null}
            {user.facultyProfile ? (
              <p>
                <span className="text-[var(--color-muted)]">Faculty: </span>
                {user.facultyProfile.employeeCode} · {user.facultyProfile.department.code}
                {user.facultyProfile.designation ? ` · ${user.facultyProfile.designation}` : ""}
              </p>
            ) : null}
            <p className="pt-1">
              <span className="text-[var(--color-muted)]">Roles: </span>
              <span className="ml-1 inline-flex flex-wrap gap-1">
                {user.roles.map((r) => (
                  <Badge key={r.id} tone="brand">
                    {ROLE_LABELS[r.role as Role] ?? r.role}
                    {r.department ? ` · ${r.department.code}` : ""}
                  </Badge>
                ))}
              </span>
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Change password" />
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Active sessions" description="Changing your password signs out every other session." />
        <CardBody>
          <ul className="space-y-1 text-[13px]">
            {user.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-[var(--color-muted)]">{s.userAgent ?? "Unknown device"}</span>
                <span>
                  {formatDateTime(s.createdAt)} · expires {formatDateTime(s.expiresAt)}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="My permissions"
          description="Exactly what the server will allow for this account — the UI is filtered by the same list."
        />
        <CardBody>
          <div className="flex flex-wrap gap-1">
            {permissions.map((p) => (
              <Badge key={p}>{p}</Badge>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
