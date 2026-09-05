import { db } from "@/lib/db";
import { DISCUSSION_MAX_CHARS } from "@/lib/domain/constants";
import type { Principal } from "@/lib/auth/rbac";
import { AuthorizationError, isCollegeWide } from "@/lib/auth/rbac";
import { evaluateGeofence } from "@/lib/geo";
import { getGeofence, getSetting } from "@/lib/services/settings";
import { storage } from "@/lib/storage";
import { stampEvidence } from "@/lib/evidence/watermark";
import { recordAudit } from "@/lib/services/audit";
import { notify, notifyMany } from "@/lib/services/notifications";
import { DomainError } from "@/lib/services/teams";

export interface CaptureInput {
  /** Raw bytes of the in-browser camera capture. Gallery uploads are refused upstream. */
  image: Buffer;
  mimeType: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: Date;
  address: string | null;
  deviceInfo: string | null;
}

export interface SubmitMeetingInput {
  teamId: string;
  discussion: string;
  presentStudentIds: string[];
  capture: CaptureInput;
}

async function allocateMeetingCode(): Promise<string> {
  // Meeting codes are human references (MR-000123). The unique index is the
  // real guard; this loop resolves the rare concurrent-insert collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await db.meeting.count();
    const code = `MR-${String(count + 1 + attempt).padStart(6, "0")}`;
    const clash = await db.meeting.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  return `MR-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Records an official project meeting.
 *
 * The GPS fix, the geofence verdict and the watermark are all re-derived on the
 * server: the browser's verdict is advisory UX only. The mentor cannot supply
 * the team ID, coordinates, timestamps or watermark text used in the stamped
 * image — those come from the database and the validated fix.
 */
export async function submitMeeting(principal: Principal, input: SubmitMeetingInput) {
  const discussion = input.discussion.trim();
  if (!discussion) throw new DomainError("Add a one-line note about what was discussed.");
  if (discussion.length > DISCUSSION_MAX_CHARS) {
    throw new DomainError(`Keep the discussion note under ${DISCUSSION_MAX_CHARS} characters.`);
  }

  const team = await db.team.findUniqueOrThrow({
    where: { id: input.teamId },
    include: {
      members: { where: { removedAt: null }, include: { student: { include: { user: true } } } },
      mentor: { select: { id: true, name: true } },
      department: { select: { id: true, code: true } },
    },
  });

  if (!team.teamId) throw new DomainError("This team's registration has not been approved yet.");
  if (team.status === "ARCHIVED") throw new DomainError("This team is archived.");

  const isMentor = team.mentorUserId === principal.userId;
  const isHod = principal.roles.includes("HOD") && principal.departmentIds.includes(team.departmentId);
  if (!isMentor && !isHod) {
    throw new AuthorizationError("Only the team's assigned faculty mentor can record official meeting evidence.");
  }

  // --- Geofence: server-side re-evaluation, using the rules in force now ----
  const rules = await getGeofence(team.departmentId);
  const verdict = evaluateGeofence(
    { latitude: input.capture.latitude, longitude: input.capture.longitude, accuracyM: input.capture.accuracyM },
    rules,
  );
  if (!verdict.allowed) {
    throw new DomainError(verdict.reason ?? "Location verification failed.");
  }

  // --- Attendance snapshot ------------------------------------------------
  const memberIds = new Set(team.members.map((m) => m.studentId));
  const present = input.presentStudentIds.filter((id) => memberIds.has(id));
  const unknown = input.presentStudentIds.filter((id) => !memberIds.has(id));
  if (unknown.length) throw new DomainError("Attendance can only be marked for registered team members.");

  // --- Evidence images ----------------------------------------------------
  const receivedAt = new Date();
  const capturedAt =
    Math.abs(receivedAt.getTime() - input.capture.capturedAt.getTime()) > 15 * 60 * 1000
      ? receivedAt // device clock is implausible; fall back to the trusted clock
      : input.capture.capturedAt;

  // The address on the stamp is derived from the trusted campus anchor when the
  // fix is inside the fence — never from text the client supplied.
  const address = verdict.insideFence ? rules.name : input.capture.address;

  const stamped = await stampEvidence(input.capture.image, {
    teamId: team.teamId,
    projectTitle: team.projectTitle,
    mentorName: team.mentor?.name ?? principal.name,
    latitude: input.capture.latitude,
    longitude: input.capture.longitude,
    accuracyM: input.capture.accuracyM,
    address,
    capturedAt,
  });

  const store = storage();
  const prefix = `evidence/${team.department.code}/${team.teamId}`;
  const originalObj = await store.put({
    body: input.capture.image,
    mimeType: input.capture.mimeType,
    prefix: `${prefix}/original`,
    extension: input.capture.mimeType === "image/png" ? "png" : "jpg",
  });
  const stampedObj = await store.put({
    body: stamped,
    mimeType: "image/jpeg",
    prefix: `${prefix}/stamped`,
    extension: "jpg",
  });

  const meetingRules = await getSetting("meetings.rules", team.departmentId);
  const autoApprove = !meetingRules.requireApproval || (meetingRules.mentorSelfApproves && isMentor);
  const code = await allocateMeetingCode();

  const meeting = await db.$transaction(async (tx) => {
    const created = await tx.meeting.create({
      data: {
        code,
        teamId: team.id,
        mentorUserId: principal.userId,
        discussion,
        heldAt: capturedAt,
        status: autoApprove ? "APPROVED" : "PENDING_APPROVAL",
        presentCount: present.length,
        memberCount: team.members.length,
        attendance: {
          create: team.members.map((m) => ({
            studentId: m.studentId,
            present: present.includes(m.studentId),
            nameSnapshot: m.student.user.name,
            enrollSnapshot: m.student.enrollmentNo,
          })),
        },
        evidence: {
          create: {
            originalKey: originalObj.key,
            stampedKey: stampedObj.key,
            mimeType: "image/jpeg",
            bytes: stampedObj.bytes,
            latitude: input.capture.latitude,
            longitude: input.capture.longitude,
            accuracyM: input.capture.accuracyM,
            address,
            capturedAt,
            receivedAt,
            distanceM: verdict.distanceM,
            radiusM: verdict.radiusM,
            geofenceOk: verdict.insideFence,
            accuracyBand: verdict.accuracyBand,
            deviceInfo: input.capture.deviceInfo,
          },
        },
      },
    });

    if (autoApprove) {
      await tx.meetingApproval.create({
        data: {
          meetingId: created.id,
          actorUserId: principal.userId,
          actorRole: isMentor ? "FACULTY_MENTOR" : "HOD",
          action: "APPROVE",
          reason: "Auto-approved by the configured meeting workflow.",
        },
      });
    }

    await tx.timelineEvent.create({
      data: {
        teamId: team.id,
        kind: "MEETING",
        title: `Meeting ${created.code}`,
        detail: `${present.length}/${team.members.length} present — ${discussion}`,
        occurredAt: capturedAt,
        actorUserId: principal.userId,
      },
    });

    if (!autoApprove) {
      const hods = await tx.userRole.findMany({
        where: { role: "HOD", departmentId: team.departmentId },
        select: { userId: true },
      });
      await notifyMany(tx, hods.map((h) => h.userId), {
        kind: "MEETING_PENDING",
        title: `Meeting ${created.code} awaiting approval`,
        body: `${team.teamId} — ${discussion}`,
        link: `/meetings/${created.id}`,
      });
    }

    await notifyMany(
      tx,
      team.members.map((m) => m.student.userId),
      {
        kind: "MEETING_RECORDED",
        title: `Meeting recorded — ${created.code}`,
        body: discussion,
        link: "/my-team/meetings",
      },
    );

    return created;
  });

  await recordAudit(principal, {
    action: "MEETING_SUBMITTED",
    entity: "Meeting",
    entityId: meeting.id,
    summary: `Recorded ${meeting.code} for ${team.teamId} (${present.length}/${team.members.length} present, ±${Math.round(
      input.capture.accuracyM,
    )}m, ${Math.round(verdict.distanceM)}m from campus)`,
  });

  return meeting;
}

export async function decideMeeting(
  principal: Principal,
  meetingId: string,
  action: "APPROVE" | "REJECT" | "REQUEST_RESUBMISSION",
  reason?: string,
) {
  const meeting = await db.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { team: { select: { id: true, teamId: true, departmentId: true, mentorUserId: true } } },
  });

  const rules = await getSetting("meetings.rules", meeting.team.departmentId);
  const actorRole = resolveApproverRole(principal, meeting.team.departmentId, meeting.team.mentorUserId);
  if (!actorRole || !rules.approverRoles.includes(actorRole as never)) {
    if (!isCollegeWide(principal)) {
      throw new AuthorizationError("Your role is not configured to decide meeting evidence for this department.");
    }
  }
  if (action !== "APPROVE" && !reason?.trim()) {
    throw new DomainError("Give a reason so the mentor knows what to correct.");
  }

  const status =
    action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "RESUBMISSION_REQUIRED";

  const updated = await db.$transaction(async (tx) => {
    await tx.meetingApproval.create({
      data: {
        meetingId: meeting.id,
        actorUserId: principal.userId,
        actorRole: actorRole ?? principal.roles[0] ?? "ADMIN",
        action,
        reason: reason?.trim() || null,
      },
    });
    const result = await tx.meeting.update({ where: { id: meeting.id }, data: { status } });
    await notify(tx, meeting.mentorUserId, {
      kind: `MEETING_${status}`,
      title: `Meeting ${meeting.code} ${status.toLowerCase().replace(/_/g, " ")}`,
      body: reason?.trim() || null,
      link: `/meetings/${meeting.id}`,
    });
    return result;
  });

  await recordAudit(principal, {
    action: `MEETING_${action}`,
    entity: "Meeting",
    entityId: meeting.id,
    summary: `${action} on ${meeting.code} (${meeting.team.teamId})${reason ? `: ${reason.trim()}` : ""}`,
    before: { status: meeting.status },
    after: { status },
  });

  return updated;
}

function resolveApproverRole(
  principal: Principal,
  departmentId: string,
  mentorUserId: string | null,
): string | null {
  if (principal.roles.includes("SUPER_ADMIN")) return "SUPER_ADMIN";
  if (principal.roles.includes("DIRECTOR")) return "DIRECTOR";
  if (principal.roles.includes("ADMIN")) return "ADMIN";
  if (principal.roles.includes("HOD") && principal.departmentIds.includes(departmentId)) return "HOD";
  if (principal.roles.includes("FACULTY_MENTOR") && mentorUserId === principal.userId) return "FACULTY_MENTOR";
  return null;
}
