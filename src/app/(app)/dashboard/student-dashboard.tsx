import { db } from "@/lib/db";
import type { Principal } from "@/lib/auth/rbac";
import { computeTeamMetrics } from "@/lib/services/analytics";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  HealthPill,
  PageHeader,
  Stat,
  StatusBadge,
} from "@/components/ui";
import { formatDate, formatPct, relativeDays } from "@/lib/utils";

export async function StudentDashboard({ principal }: { principal: Principal }) {
  if (!principal.studentProfileId) {
    return <EmptyState title="No student profile" description="Ask your department office to complete your record." />;
  }

  const membership = await db.teamMember.findFirst({
    where: { studentId: principal.studentProfileId, removedAt: null },
    include: {
      team: {
        include: {
          department: { select: { code: true } },
          section: { select: { name: true } },
          semester: { select: { number: true } },
          projectType: { select: { name: true } },
          mentor: { select: { name: true, email: true } },
          members: {
            where: { removedAt: null },
            include: { student: { include: { user: { select: { name: true } } } } },
          },
          meetings: {
            where: { status: { not: "REJECTED" } },
            orderBy: { heldAt: "desc" },
            take: 5,
            include: { attendance: { where: { studentId: principal.studentProfileId } } },
          },
          presentationSlots: {
            where: { presentation: { scheduledOn: { gte: new Date() } } },
            include: { presentation: true },
            orderBy: { presentation: { scheduledOn: "asc" } },
            take: 3,
          },
        },
      },
    },
  });

  if (!membership) {
    return (
      <>
        <PageHeader title="My project" />
        <Card>
          <EmptyState
            title="You are not in a team yet"
            description="If you are the team lead, register your project. Otherwise ask your lead to add your enrollment number."
            action={<ButtonLink href="/register" variant="primary">Register a team</ButtonLink>}
          />
        </Card>
      </>
    );
  }

  const team = membership.team;
  const [metrics] = await computeTeamMetrics({ id: team.id });

  const myAttendance = await db.meetingAttendance.findMany({
    where: { studentId: principal.studentProfileId, meeting: { teamId: team.id, status: { not: "REJECTED" } } },
    select: { present: true },
  });
  const myPct = myAttendance.length
    ? (myAttendance.filter((a) => a.present).length / myAttendance.length) * 100
    : null;

  const nextPresentation = team.presentationSlots[0];

  return (
    <>
      <PageHeader
        title={team.teamId ?? "Registration pending"}
        description={team.projectTitle}
        action={<ButtonLink href="/my-team">Open workspace</ButtonLink>}
      />

      {team.registrationStatus !== "APPROVED" ? (
        <Card className="mb-4">
          <CardBody className="flex flex-wrap items-center gap-3">
            <StatusBadge status={team.registrationStatus} />
            <p className="text-[13px] text-[var(--color-muted)]">
              {team.registrationStatus === "REJECTED"
                ? `Correction requested: ${team.rejectionReason}`
                : "Your Team ID is issued once your mentor or HOD approves the registration."}
            </p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="My attendance"
          value={formatPct(myPct, 0)}
          sub={`${myAttendance.filter((a) => a.present).length}/${myAttendance.length} meetings`}
          tone={(myPct ?? 0) >= 75 ? "success" : "warning"}
        />
        <Stat label="Team attendance" value={formatPct(metrics?.attendancePct, 0)} />
        <Stat label="Meetings" value={metrics?.meetingsHeld ?? 0} sub={`Last: ${relativeDays(metrics?.lastMeetingAt ?? null)}`} />
        <Stat
          label="Project health"
          value={metrics ? <HealthPill score={metrics.healthScore} label={metrics.healthLabel} /> : "—"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent meetings" action={<ButtonLink size="sm" href="/my-team/meetings">All meetings</ButtonLink>} />
          {team.meetings.length ? (
            <ul className="divide-y divide-[var(--color-line)]">
              {team.meetings.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{m.discussion}</p>
                    <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
                      {m.code} · {formatDate(m.heldAt)} · {m.presentCount}/{m.memberCount} present
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {m.attendance[0] ? (
                      <Badge tone={m.attendance[0].present ? "success" : "danger"}>
                        {m.attendance[0].present ? "Present" : "Absent"}
                      </Badge>
                    ) : null}
                    <StatusBadge status={m.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No meetings recorded yet" description="Your mentor records official meetings from their device." />
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Team" />
            <CardBody className="space-y-2 text-[13px]">
              <p>
                <span className="text-[var(--color-muted)]">Mentor: </span>
                {team.mentor?.name ?? "Not assigned"}
              </p>
              <p>
                <span className="text-[var(--color-muted)]">Type: </span>
                {team.projectType.name} · Sem {team.semester.number} · {team.department.code}
                {team.section ? `-${team.section.name}` : ""}
              </p>
              <ul className="mt-2 space-y-1">
                {team.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <span>{m.student.user.name}</span>
                    <span className="text-[12px] text-[var(--color-muted)]">
                      {m.student.enrollmentNo}
                      {m.isLead ? " · Lead" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Next presentation" />
            <CardBody className="text-[13px]">
              {nextPresentation ? (
                <>
                  <p className="font-medium">{nextPresentation.presentation.name}</p>
                  <p className="mt-1 text-[var(--color-muted)]">
                    {formatDate(nextPresentation.presentation.scheduledOn)}
                    {nextPresentation.slotTime ? ` · ${nextPresentation.slotTime}` : ""}
                  </p>
                  <p className="text-[var(--color-muted)]">
                    {nextPresentation.venue ?? nextPresentation.presentation.venue ?? "Venue to be announced"}
                  </p>
                </>
              ) : (
                <p className="text-[var(--color-muted)]">Nothing scheduled yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
