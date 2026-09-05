import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { db } from "@/lib/db";
import { getGeofence } from "@/lib/services/settings";
import { PageHeader } from "@/components/ui";
import { CaptureFlow } from "./capture-flow";

export const metadata = { title: "Capture evidence" };

export default async function CaptureMeetingPage({ params }: { params: Promise<{ teamId: string }> }) {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["meeting.record"]);
  if (denied) return denied;
  const { teamId } = await params;

  const team = await db.team.findUnique({
    where: { id: teamId },
    include: {
      department: { select: { id: true, code: true } },
      mentor: { select: { id: true, name: true } },
      members: {
        where: { removedAt: null },
        include: { student: { include: { user: { select: { name: true } } } } },
        orderBy: { isLead: "desc" },
      },
    },
  });

  if (!team || !team.teamId) notFound();

  const isMentor = team.mentorUserId === principal.userId;
  const isHod = principal.roles.includes("HOD") && principal.departmentIds.includes(team.departmentId);
  if (!isMentor && !isHod) notFound();

  const rules = await getGeofence(team.departmentId);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={team.teamId}
        description={team.projectTitle}
        breadcrumb={`${team.department.code} · Mentor ${team.mentor?.name ?? "—"}`}
      />
      <CaptureFlow
        teamId={team.id}
        teamCode={team.teamId}
        members={team.members.map((m) => ({
          studentId: m.studentId,
          name: m.student.user.name,
          enrollmentNo: m.student.enrollmentNo,
          isLead: m.isLead,
        }))}
        rules={{
          latitude: rules.latitude,
          longitude: rules.longitude,
          radiusM: rules.radiusM,
          minAccuracyM: rules.minAccuracyM,
          goodAccuracyM: rules.goodAccuracyM,
          warnAccuracyM: rules.warnAccuracyM,
          enforce: rules.enforce,
          name: rules.name,
        }}
      />
    </div>
  );
}
