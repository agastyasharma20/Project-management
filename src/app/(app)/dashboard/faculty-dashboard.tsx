import Link from "next/link";
import { db } from "@/lib/db";
import type { Principal } from "@/lib/auth/rbac";
import { computeTeamMetrics, summarise } from "@/lib/services/analytics";
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  HealthPill,
  PageHeader,
  Stat,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatPct, relativeDays } from "@/lib/utils";

export async function FacultyDashboard({ principal }: { principal: Principal }) {
  const where = { mentorUserId: principal.userId, registrationStatus: "APPROVED" as const };

  const [metrics, pendingRegistrations, pendingMeetings, upcoming] = await Promise.all([
    computeTeamMetrics(where),
    db.team.findMany({
      where: { mentorUserId: principal.userId, registrationStatus: "SUBMITTED" },
      select: { id: true, projectTitle: true, createdAt: true, leadStudent: { select: { enrollmentNo: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.meeting.count({ where: { mentorUserId: principal.userId, status: "PENDING_APPROVAL" } }),
    db.presentationTeam.findMany({
      where: { team: { mentorUserId: principal.userId }, presentation: { scheduledOn: { gte: new Date() } } },
      include: { presentation: true, team: { select: { teamId: true } } },
      orderBy: { presentation: { scheduledOn: "asc" } },
      take: 5,
    }),
  ]);

  const totals = summarise(metrics);

  return (
    <>
      <PageHeader
        title="My mentoring"
        description="Your teams, their attendance and the meetings still to be recorded."
        action={
          <ButtonLink href="/meetings/record" variant="primary">
            Record a meeting
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="My teams" value={totals.teams} sub={`${totals.students} students`} />
        <Stat label="Mentee attendance" value={formatPct(totals.attendancePct, 1)} />
        <Stat label="Meetings recorded" value={totals.meetings} />
        <Stat
          label="At-risk teams"
          value={totals.atRisk}
          tone={totals.atRisk > 0 ? "danger" : "success"}
        />
      </div>

      {pendingRegistrations.length ? (
        <Card className="mt-5">
          <CardHeader
            title="Registrations awaiting your approval"
            description="A Team ID is issued only after you approve."
          />
          <Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Team lead</Th>
                <Th>Submitted</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pendingRegistrations.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.projectTitle}</Td>
                  <Td>{r.leadStudent.enrollmentNo}</Td>
                  <Td className="tabular">{relativeDays(r.createdAt)}</Td>
                  <Td className="text-right">
                    <ButtonLink size="sm" href={`/registrations/${r.id}`}>
                      Review
                    </ButtonLink>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card className="mt-5">
        <CardHeader
          title="My teams"
          description={pendingMeetings ? `${pendingMeetings} of your submissions are awaiting approval` : undefined}
        />
        {metrics.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Team</Th>
                <Th>Members</Th>
                <Th>Meetings</Th>
                <Th>Last meeting</Th>
                <Th>Attendance</Th>
                <Th>Health</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.teamId}>
                  <Td>
                    <Link href={`/teams/${m.teamId}`} className="font-medium text-[var(--color-brand-600)]">
                      {m.code}
                    </Link>
                    <span className="block max-w-[18rem] truncate text-[12px] text-[var(--color-muted)]">
                      {m.projectTitle}
                    </span>
                  </Td>
                  <Td className="tabular">{m.memberCount}</Td>
                  <Td className="tabular">
                    {m.meetingsHeld}/{m.expectedMeetings}
                  </Td>
                  <Td className="whitespace-nowrap">{relativeDays(m.lastMeetingAt)}</Td>
                  <Td className="tabular">{formatPct(m.attendancePct, 0)}</Td>
                  <Td>
                    <HealthPill score={m.healthScore} label={m.healthLabel} />
                  </Td>
                  <Td className="text-right">
                    <ButtonLink size="sm" href={`/meetings/record/${m.teamId}`} variant="primary">
                      Record
                    </ButtonLink>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            title="No approved teams yet"
            description="Teams appear here once their registration is approved."
          />
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Upcoming presentations for my teams" />
        {upcoming.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Presentation</Th>
                <Th>Team</Th>
                <Th>Date</Th>
                <Th>Slot</Th>
                <Th>Venue</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((slot) => (
                <tr key={slot.id}>
                  <Td className="font-medium">{slot.presentation.name}</Td>
                  <Td>{slot.team.teamId}</Td>
                  <Td className="whitespace-nowrap">
                    {new Date(slot.presentation.scheduledOn).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </Td>
                  <Td>{slot.slotTime ?? slot.presentation.startTime ?? "—"}</Td>
                  <Td>{slot.venue ?? slot.presentation.venue ?? "—"}</Td>
                  <Td>
                    <StatusBadge status={slot.presentation.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No scheduled presentations" />
        )}
      </Card>
    </>
  );
}
