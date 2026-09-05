import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { can, canAccessDepartment } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { teamScopeWhere } from "@/lib/services/teams";
import { Badge, Card, CardBody, CardHeader, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { formatStampDate, formatStampTime } from "@/lib/evidence/watermark";
import { MeetingDecisionPanel } from "./decision-panel";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await requirePrincipal();
  const { id } = await params;

  const meeting = await db.meeting.findFirst({
    where: { AND: [{ id }, { team: teamScopeWhere(principal) }] },
    include: {
      team: { include: { department: { select: { code: true } } } },
      mentor: { select: { name: true, email: true } },
      evidence: true,
      attendance: { orderBy: { enrollSnapshot: "asc" } },
      approvals: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!meeting) notFound();

  const store = storage();
  const canDecide =
    can(principal, "meeting.approve") && canAccessDepartment(principal, meeting.team.departmentId);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumb={
          <Link href="/meetings" className="hover:underline">
            Meetings
          </Link>
        }
        title={meeting.code}
        description={`${meeting.team.teamId} · ${meeting.team.projectTitle}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={meeting.status} />
        <Badge>Recorded by {meeting.mentor.name}</Badge>
        <Badge tone={meeting.evidence?.geofenceOk ? "success" : "danger"}>
          {meeting.evidence?.geofenceOk ? "Inside campus geofence" : "Outside geofence"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader title="Evidence photo" description="Server-stamped from trusted values" />
          <CardBody className="space-y-3">
            {meeting.evidence ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={store.publicUrl(meeting.evidence.stampedKey)}
                  alt={`Stamped meeting evidence for ${meeting.team.teamId}`}
                  className="w-full rounded-xl border border-[var(--color-line)]"
                />
                <a
                  href={store.publicUrl(meeting.evidence.originalKey)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-[var(--color-brand-600)] underline"
                >
                  View the original unmodified capture
                </a>
              </>
            ) : (
              <p className="text-[13px] text-[var(--color-muted)]">No evidence attached.</p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Capture record" description="These values cannot be edited by any role." />
            <CardBody>
              {meeting.evidence ? (
                <dl className="space-y-1.5 text-[13px]">
                  <Row label="Latitude" value={meeting.evidence.latitude.toFixed(6)} />
                  <Row label="Longitude" value={meeting.evidence.longitude.toFixed(6)} />
                  <Row label="Accuracy" value={`±${Math.round(meeting.evidence.accuracyM)}m (${meeting.evidence.accuracyBand.toLowerCase()})`} />
                  <Row label="Distance from anchor" value={`${Math.round(meeting.evidence.distanceM)}m of ${Math.round(meeting.evidence.radiusM)}m`} />
                  <Row label="Address" value={meeting.evidence.address ?? "Not resolved"} />
                  <Row
                    label="Captured"
                    value={`${formatStampDate(meeting.evidence.capturedAt)} ${formatStampTime(meeting.evidence.capturedAt)}`}
                  />
                  <Row label="Received by server" value={formatDateTime(meeting.evidence.receivedAt)} />
                  <Row label="Device" value={meeting.evidence.deviceInfo ?? "—"} />
                </dl>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Discussion" />
            <CardBody className="text-[13px]">{meeting.discussion}</CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Attendance snapshot"
          description={`${meeting.presentCount}/${meeting.memberCount} present — stored immutably with the meeting`}
        />
        <Table>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Enrollment</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {meeting.attendance.map((a) => (
              <tr key={a.id}>
                <Td className="font-medium">{a.nameSnapshot}</Td>
                <Td>{a.enrollSnapshot}</Td>
                <Td>
                  <Badge tone={a.present ? "success" : "danger"}>{a.present ? "Present" : "Absent"}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {meeting.approvals.length ? (
        <Card className="mt-4">
          <CardHeader title="Approval history" />
          <ul className="divide-y divide-[var(--color-line)]">
            {meeting.approvals.map((a) => (
              <li key={a.id} className="px-4 py-3 text-[13px]">
                <span className="font-medium">{a.action.replace(/_/g, " ").toLowerCase()}</span> by {a.actor.name} (
                {a.actorRole.replace(/_/g, " ").toLowerCase()}) · {formatDateTime(a.createdAt)}
                {a.reason ? <p className="mt-0.5 text-[var(--color-muted)]">{a.reason}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {canDecide && meeting.status !== "APPROVED" ? (
        <div className="mt-4">
          <MeetingDecisionPanel meetingId={meeting.id} />
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="tabular text-right">{value}</dd>
    </div>
  );
}
