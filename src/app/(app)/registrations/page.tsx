import Link from "next/link";
import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { db } from "@/lib/db";
import { teamScopeWhere } from "@/lib/services/teams";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { formatDate, param } from "@/lib/utils";

export const metadata = { title: "Registrations" };

export default async function RegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["team.approve"]);
  if (denied) return denied;
  const sp = await searchParams;
  const status = param(sp, "status") ?? "SUBMITTED";

  const teams = await db.team.findMany({
    where: { AND: [teamScopeWhere(principal), { registrationStatus: status }] },
    include: {
      department: { select: { code: true } },
      semester: { select: { number: true } },
      projectType: { select: { code: true } },
      mentor: { select: { name: true } },
      leadStudent: { include: { user: { select: { name: true } } } },
      members: { where: { removedAt: null }, select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Registrations"
        description="A Team ID is generated only after an authorised approval."
      />

      <nav className="mb-4 flex gap-2" aria-label="Registration status">
        {["SUBMITTED", "APPROVED", "REJECTED"].map((s) => (
          <Link
            key={s}
            href={`/registrations?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={
              s === status
                ? "rounded-lg bg-[var(--color-brand-600)] px-3 py-1.5 text-[13px] font-medium text-white"
                : "rounded-lg border border-[var(--color-line-strong)] bg-white px-3 py-1.5 text-[13px]"
            }
          >
            {s.toLowerCase()}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader title={`${teams.length} registration${teams.length === 1 ? "" : "s"}`} />
        {teams.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Lead</Th>
                <Th>Department</Th>
                <Th>Type</Th>
                <Th>Mentor</Th>
                <Th>Members</Th>
                <Th>Submitted</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id}>
                  <Td className="max-w-[18rem]">
                    <span className="block truncate font-medium">{team.projectTitle}</span>
                    {team.teamId ? (
                      <span className="text-[12px] text-[var(--color-muted)]">{team.teamId}</span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {team.leadStudent.user.name}
                    <span className="block text-[12px] text-[var(--color-muted)]">
                      {team.leadStudent.enrollmentNo}
                    </span>
                  </Td>
                  <Td>
                    {team.department.code} · S{team.semester.number}
                  </Td>
                  <Td>{team.projectType.code}</Td>
                  <Td>{team.mentor?.name ?? "—"}</Td>
                  <Td className="tabular">{team.members.length}</Td>
                  <Td className="whitespace-nowrap">{formatDate(team.createdAt)}</Td>
                  <Td>
                    <StatusBadge status={team.registrationStatus} />
                  </Td>
                  <Td className="text-right">
                    <ButtonLink size="sm" href={`/registrations/${team.id}`}>
                      Review
                    </ButtonLink>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nothing here" description="No registrations with this status in your scope." />
        )}
      </Card>
    </>
  );
}
