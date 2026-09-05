import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { can, canAccessDepartment } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { teamScopeWhere } from "@/lib/services/teams";
import { computeTeamMetrics, studentAttendance } from "@/lib/services/analytics";
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
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDate, formatDateTime, formatPct, param, relativeDays } from "@/lib/utils";
import { TeamAdminPanel } from "./team-admin-panel";
import { ResourceForm } from "./resource-form";

const TABS = ["overview", "team", "meetings", "attendance", "presentations", "resources", "marks", "timeline", "manage"] as const;
type Tab = (typeof TABS)[number];

export default async function TeamWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal();
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS.find((t) => t === param(sp, "tab")) ?? "overview") as Tab;

  const team = await db.team.findFirst({
    where: { AND: [{ id }, teamScopeWhere(principal)] },
    include: {
      department: true,
      section: true,
      semester: true,
      projectType: true,
      academicYear: true,
      mentor: { select: { id: true, name: true, email: true } },
      members: {
        where: { removedAt: null },
        include: { student: { include: { user: { select: { name: true, email: true, phone: true } } } } },
        orderBy: { isLead: "desc" },
      },
      meetings: {
        orderBy: { heldAt: "desc" },
        include: { evidence: true, mentor: { select: { name: true } } },
      },
      resources: {
        where: { isArchived: false },
        include: { category: true, addedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
      timeline: { orderBy: { occurredAt: "desc" }, include: { actor: { select: { name: true } } } },
      presentationSlots: {
        include: {
          presentation: { include: { scheme: true } },
          submissions: { include: { judge: { select: { name: true } }, marks: { include: { criterion: true } } } },
        },
        orderBy: { presentation: { scheduledOn: "asc" } },
      },
    },
  });

  if (!team) notFound();

  const [metrics] = await computeTeamMetrics({ id: team.id });
  const perStudent = await studentAttendance([team.id]);
  const canManage = can(principal, "team.write") && canAccessDepartment(principal, team.departmentId);

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/teams" className="hover:underline">
            Projects
          </Link>
        }
        title={team.teamId ?? "Registration pending"}
        description={team.projectTitle}
        action={
          canManage ? (
            <ButtonLink href={`/teams/${team.id}?tab=manage`} variant="primary">
              Manage
            </ButtonLink>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={team.registrationStatus === "APPROVED" ? team.status : team.registrationStatus} />
        <Badge tone="brand">{team.projectType.name}</Badge>
        <Badge>
          {team.department.code}
          {team.section ? `-${team.section.name}` : ""} · Semester {team.semester.number}
        </Badge>
        <Badge>{team.academicYear.label}</Badge>
        {metrics ? <HealthPill score={metrics.healthScore} label={metrics.healthLabel} /> : null}
      </div>

      <nav className="scroll-x mb-4 flex gap-1 border-b border-[var(--color-line)]" aria-label="Workspace sections">
        {TABS.filter((t) => t !== "manage" || canManage).map((t) => (
          <Link
            key={t}
            href={`/teams/${team.id}?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={
              t === tab
                ? "-mb-px border-b-2 border-[var(--color-brand-600)] px-3 py-2 text-[13px] font-medium text-[var(--color-brand-700)]"
                : "px-3 py-2 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            }
          >
            {t[0].toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Meetings"
              value={`${metrics?.meetingsHeld ?? 0}/${metrics?.expectedMeetings ?? "—"}`}
              sub={`Last ${relativeDays(metrics?.lastMeetingAt ?? null)}`}
            />
            <Stat label="Attendance" value={formatPct(metrics?.attendancePct, 1)} />
            <Stat label="Presentation" value={formatPct(metrics?.presentationPct, 1)} />
            <Stat label="Resources" value={formatPct(metrics?.resourceCompletenessPct, 0)} sub="Required categories present" />
          </div>

          {metrics?.risks.length ? (
            <Card>
              <CardHeader title="Risk flags" description="Matched against the configured thresholds" />
              <CardBody>
                <ul className="space-y-1 text-[13px] text-[var(--color-danger)]">
                  {metrics.risks.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Project description" />
            <CardBody className="whitespace-pre-wrap text-[13px]">{team.projectDescription}</CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "team" ? (
        <Card>
          <CardHeader title="Team members" description={`Mentor: ${team.mentor?.name ?? "Not assigned"}`} />
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
                  <Td>{m.isLead ? <Badge tone="brand">Team lead</Badge> : "Member"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {tab === "meetings" ? (
        <Card>
          <CardHeader title="Meeting history" description={`${team.meetings.length} records`} />
          {team.meetings.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Held</Th>
                  <Th>Discussion</Th>
                  <Th>Attendance</Th>
                  <Th>Location</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {team.meetings.map((m) => (
                  <tr key={m.id}>
                    <Td className="font-medium">{m.code}</Td>
                    <Td className="whitespace-nowrap">{formatDateTime(m.heldAt)}</Td>
                    <Td className="max-w-[22rem]">{m.discussion}</Td>
                    <Td className="tabular">
                      {m.presentCount}/{m.memberCount}
                    </Td>
                    <Td className="whitespace-nowrap text-[12px]">
                      {m.evidence ? (
                        <>
                          {m.evidence.geofenceOk ? (
                            <Badge tone="success">on campus</Badge>
                          ) : (
                            <Badge tone="danger">outside</Badge>
                          )}
                          <span className="tabular ml-1 text-[var(--color-muted)]">
                            ±{Math.round(m.evidence.accuracyM)}m
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={m.status} />
                    </Td>
                    <Td className="text-right">
                      <ButtonLink size="sm" href={`/meetings/${m.id}`}>
                        Evidence
                      </ButtonLink>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No meetings recorded" />
          )}
        </Card>
      ) : null}

      {tab === "attendance" ? (
        <Card>
          <CardHeader
            title="Attendance by student"
            description="Computed from immutable per-meeting snapshots"
          />
          {perStudent.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Enrollment</Th>
                  <Th>Present</Th>
                  <Th>Meetings</Th>
                  <Th>Attendance</Th>
                </tr>
              </thead>
              <tbody>
                {perStudent.map((s) => (
                  <tr key={s.studentId}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td>{s.enrollmentNo}</Td>
                    <Td className="tabular">{s.present}</Td>
                    <Td className="tabular">{s.total}</Td>
                    <Td>
                      <Badge tone={(s.pct ?? 0) >= 75 ? "success" : (s.pct ?? 0) >= 60 ? "warning" : "danger"}>
                        {formatPct(s.pct, 1)}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="No attendance yet" />
          )}
        </Card>
      ) : null}

      {tab === "presentations" ? (
        <Card>
          <CardHeader title="Presentation schedule" />
          {team.presentationSlots.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Presentation</Th>
                  <Th>Date</Th>
                  <Th>Slot</Th>
                  <Th>Venue</Th>
                  <Th>Judges submitted</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {team.presentationSlots.map((slot) => (
                  <tr key={slot.id}>
                    <Td className="font-medium">{slot.presentation.name}</Td>
                    <Td className="whitespace-nowrap">{formatDate(slot.presentation.scheduledOn)}</Td>
                    <Td>{slot.slotTime ?? slot.presentation.startTime ?? "—"}</Td>
                    <Td>{slot.venue ?? slot.presentation.venue ?? "—"}</Td>
                    <Td className="tabular">{slot.submissions.filter((s) => s.status === "SUBMITTED").length}</Td>
                    <Td>
                      <StatusBadge status={slot.presentation.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Not scheduled for any presentation yet" />
          )}
        </Card>
      ) : null}

      {tab === "resources" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader title="Project resources" description="GitHub, Drive, PPT, architecture, reports" />
            {team.resources.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Title</Th>
                    <Th>Category</Th>
                    <Th>Link</Th>
                    <Th>Added by</Th>
                    <Th>Version</Th>
                    <Th>Updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {team.resources.map((r) => (
                    <tr key={r.id}>
                      <Td className="font-medium">{r.title}</Td>
                      <Td>
                        <Badge tone="brand">{r.category.name}</Badge>
                      </Td>
                      <Td className="max-w-[18rem] truncate">
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="text-[var(--color-brand-600)] underline"
                          >
                            {r.url}
                          </a>
                        ) : (
                          r.fileName ?? "—"
                        )}
                      </Td>
                      <Td>{r.addedBy.name}</Td>
                      <Td className="tabular">v{r.version}</Td>
                      <Td className="whitespace-nowrap">{formatDate(r.updatedAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="No resources yet" description="Add the GitHub and Drive links to complete the workspace." />
            )}
          </Card>

          {can(principal, "resource.write") ? (
            <ResourceForm
              teamId={team.id}
              categories={await db.resourceCategory.findMany({
                where: { isActive: true },
                orderBy: { sortOrder: "asc" },
                select: { id: true, name: true },
              })}
            />
          ) : null}
        </div>
      ) : null}

      {tab === "marks" ? (
        <Card>
          <CardHeader title="Evaluation" description="Each judge's original submission is preserved." />
          {team.presentationSlots.some((s) => s.submissions.length) ? (
            <div className="space-y-4 p-4">
              {team.presentationSlots
                .filter((s) => s.submissions.length)
                .map((slot) => {
                  const submitted = slot.submissions.filter((s) => s.status === "SUBMITTED");
                  const totals = submitted.map((s) => s.totalMarks);
                  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;
                  return (
                    <div key={slot.id} className="rounded-lg border border-[var(--color-line)]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2">
                        <span className="text-[13px] font-semibold">{slot.presentation.name}</span>
                        <span className="flex items-center gap-2 text-[12px] text-[var(--color-muted)]">
                          <StatusBadge status={slot.presentation.marksVisibility} />
                          {avg !== null ? (
                            <span className="tabular">
                              Average {avg.toFixed(1)}/{slot.presentation.scheme?.totalMarks ?? "—"}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <Table>
                        <thead>
                          <tr>
                            <Th>Judge</Th>
                            <Th>Total</Th>
                            <Th>Status</Th>
                            <Th>Submitted</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {slot.submissions.map((s) => (
                            <tr key={s.id}>
                              <Td>{s.judge.name}</Td>
                              <Td className="tabular">
                                {s.totalMarks}/{s.maxMarks}
                              </Td>
                              <Td>
                                <StatusBadge status={s.status} />
                              </Td>
                              <Td className="whitespace-nowrap">{formatDateTime(s.submittedAt)}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  );
                })}
            </div>
          ) : (
            <EmptyState title="No evaluations recorded" />
          )}
        </Card>
      ) : null}

      {tab === "timeline" ? (
        <Card>
          <CardHeader title="Project timeline" description="Registration through final presentation" />
          <CardBody>
            {team.timeline.length ? (
              <ol className="relative space-y-4 border-l border-[var(--color-line)] pl-5">
                {team.timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--color-brand-500)]" />
                    <p className="text-[13px] font-medium">{event.title}</p>
                    {event.detail ? <p className="text-[13px] text-[var(--color-muted)]">{event.detail}</p> : null}
                    <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
                      {formatDateTime(event.occurredAt)}
                      {event.actor ? ` · ${event.actor.name}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No events yet" />
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "manage" && canManage ? (
        <TeamAdminPanel
          team={{
            id: team.id,
            projectTitle: team.projectTitle,
            projectDescription: team.projectDescription,
            sectionId: team.sectionId,
            semesterId: team.semesterId,
            projectTypeId: team.projectTypeId,
            status: team.status,
            mentorUserId: team.mentorUserId,
            archived: team.status === "ARCHIVED",
          }}
          members={team.members.map((m) => ({
            id: m.id,
            name: m.student.user.name,
            enrollmentNo: m.student.enrollmentNo,
            isLead: m.isLead,
          }))}
          options={{
            mentors: (
              await db.facultyProfile.findMany({
                where: { departmentId: team.departmentId },
                include: { user: { select: { id: true, name: true } } },
                orderBy: { user: { name: "asc" } },
              })
            ).map((f) => ({ value: f.user.id, label: f.user.name })),
            sections: (
              await db.section.findMany({ where: { departmentId: team.departmentId }, orderBy: { name: "asc" } })
            ).map((s) => ({ value: s.id, label: s.name })),
            semesters: (await db.semester.findMany({ orderBy: { number: "asc" } })).map((s) => ({
              value: s.id,
              label: `Semester ${s.number}`,
            })),
            projectTypes: (await db.projectType.findMany({ where: { isActive: true } })).map((t) => ({
              value: t.id,
              label: t.name,
            })),
          }}
        />
      ) : null}
    </>
  );
}
