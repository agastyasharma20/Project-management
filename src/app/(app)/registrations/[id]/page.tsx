import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { db } from "@/lib/db";
import { teamScopeWhere } from "@/lib/services/teams";
import { Badge, Card, CardBody, CardHeader, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { DecisionPanel } from "./decision-panel";

export default async function RegistrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["team.approve"]);
  if (denied) return denied;
  const { id } = await params;

  const team = await db.team.findFirst({
    where: { AND: [{ id }, teamScopeWhere(principal)] },
    include: {
      department: true,
      section: true,
      semester: true,
      projectType: true,
      academicYear: true,
      mentor: { select: { name: true, email: true } },
      members: {
        where: { removedAt: null },
        include: { student: { include: { user: true } } },
        orderBy: { isLead: "desc" },
      },
    },
  });
  if (!team) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        breadcrumb={
          <Link href="/registrations" className="hover:underline">
            Registrations
          </Link>
        }
        title={team.projectTitle}
        description={`Submitted ${formatDateTime(team.createdAt)}`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge status={team.registrationStatus} />
        <Badge tone="brand">{team.projectType.name}</Badge>
        <Badge>
          {team.department.code}
          {team.section ? `-${team.section.name}` : ""} · Semester {team.semester.number}
        </Badge>
        <Badge>{team.academicYear.label}</Badge>
      </div>

      {team.registrationStatus === "REJECTED" && team.rejectionReason ? (
        <Card className="mb-4">
          <CardBody className="text-[13px]">
            <span className="font-medium text-[var(--color-danger)]">Correction requested: </span>
            {team.rejectionReason}
          </CardBody>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardHeader title="Project description" />
        <CardBody className="whitespace-pre-wrap text-[13px]">{team.projectDescription}</CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader title="Team" description={`Mentor: ${team.mentor?.name ?? "Not assigned"}`} />
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Enrollment</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>Role</Th>
            </tr>
          </thead>
          <tbody>
            {team.members.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium">{m.student.user.name}</Td>
                <Td>{m.student.enrollmentNo}</Td>
                <Td>{m.student.user.email}</Td>
                <Td>{m.student.user.phone ?? "—"}</Td>
                <Td>{m.isLead ? "Team lead" : "Member"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {team.registrationStatus === "APPROVED" ? (
        <Card>
          <CardBody className="text-[13px]">
            Approved — Team ID <span className="font-semibold">{team.teamId}</span> issued on{" "}
            {formatDateTime(team.approvedAt)}.{" "}
            <Link href={`/teams/${team.id}`} className="text-[var(--color-brand-600)] underline">
              Open workspace
            </Link>
          </CardBody>
        </Card>
      ) : (
        <DecisionPanel teamId={team.id} />
      )}
    </div>
  );
}
