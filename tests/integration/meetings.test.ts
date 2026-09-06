import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AuthorizationError } from "@/lib/auth/rbac";
import { DISCUSSION_MAX_CHARS } from "@/lib/domain/constants";
import { decideMeeting, submitMeeting } from "@/lib/services/meetings";
import { DomainError } from "@/lib/services/teams";
import { buildAcademicEnvironment, makeApprovedTeam, makeUser } from "./fixtures";

async function samplePhoto(): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .jpeg()
    .toBuffer();
}

const INSIDE_CAMPUS = { latitude: 22.719600, longitude: 75.857800, accuracyM: 8 };
const OUTSIDE_CAMPUS = { latitude: 22.730000, longitude: 75.870000, accuracyM: 8 };

describe("meetings service", () => {
  let env: Awaited<ReturnType<typeof buildAcademicEnvironment>>;

  beforeAll(async () => {
    env = await buildAcademicEnvironment();
  });

  async function makeMentor() {
    return makeUser({
      roles: [{ role: "FACULTY_MENTOR", departmentId: env.department.id }],
      asFaculty: { departmentId: env.department.id },
    });
  }

  describe("submitMeeting", () => {
    it("records a meeting with attendance, evidence and an approval when inside the geofence", async () => {
      const mentor = await makeMentor();
      const { team, members } = await makeApprovedTeam(env, { mentor });
      const image = await samplePhoto();

      const meeting = await submitMeeting(mentor, {
        teamId: team.id,
        discussion: "Discussed database architecture and finalised the API contract.",
        presentStudentIds: [members[0].studentProfileId!, members[1].studentProfileId!],
        capture: {
          image,
          mimeType: "image/jpeg",
          ...INSIDE_CAMPUS,
          capturedAt: new Date(),
          address: null,
          deviceInfo: "vitest",
        },
      });

      expect(meeting.presentCount).toBe(2);
      expect(meeting.memberCount).toBe(members.length);
      expect(["APPROVED", "PENDING_APPROVAL"]).toContain(meeting.status);

      const evidence = await db.meetingEvidence.findUniqueOrThrow({ where: { meetingId: meeting.id } });
      expect(evidence.geofenceOk).toBe(true);
      expect(evidence.accuracyBand).toBe("GOOD");
      expect(evidence.originalKey).not.toBe(evidence.stampedKey);

      const attendance = await db.meetingAttendance.findMany({ where: { meetingId: meeting.id } });
      expect(attendance).toHaveLength(members.length);
      expect(attendance.filter((a) => a.present)).toHaveLength(2);
    });

    it("refuses the submission outright when the fix is outside the campus geofence — no meeting row is created", async () => {
      const mentor = await makeMentor();
      const { team } = await makeApprovedTeam(env, { mentor });
      const before = await db.meeting.count({ where: { teamId: team.id } });

      await expect(
        submitMeeting(mentor, {
          teamId: team.id,
          discussion: "Should never be stored.",
          presentStudentIds: [],
          capture: {
            image: await samplePhoto(),
            mimeType: "image/jpeg",
            ...OUTSIDE_CAMPUS,
            capturedAt: new Date(),
            address: null,
            deviceInfo: null,
          },
        }),
      ).rejects.toThrow(/outside the permitted project-meeting area/);

      const after = await db.meeting.count({ where: { teamId: team.id } });
      expect(after).toBe(before);
    });

    it("refuses the submission when GPS accuracy is worse than the configured policy", async () => {
      const mentor = await makeMentor();
      const { team } = await makeApprovedTeam(env, { mentor });

      await expect(
        submitMeeting(mentor, {
          teamId: team.id,
          discussion: "Poor accuracy.",
          presentStudentIds: [],
          capture: {
            image: await samplePhoto(),
            mimeType: "image/jpeg",
            latitude: INSIDE_CAMPUS.latitude,
            longitude: INSIDE_CAMPUS.longitude,
            accuracyM: 200,
            capturedAt: new Date(),
            address: null,
            deviceInfo: null,
          },
        }),
      ).rejects.toThrow(/GPS accuracy/);
    });

    it("refuses an empty or over-length discussion note", async () => {
      const mentor = await makeMentor();
      const { team } = await makeApprovedTeam(env, { mentor });

      await expect(
        submitMeeting(mentor, {
          teamId: team.id,
          discussion: "   ",
          presentStudentIds: [],
          capture: { image: await samplePhoto(), mimeType: "image/jpeg", ...INSIDE_CAMPUS, capturedAt: new Date(), address: null, deviceInfo: null },
        }),
      ).rejects.toThrow(DomainError);

      await expect(
        submitMeeting(mentor, {
          teamId: team.id,
          discussion: "x".repeat(DISCUSSION_MAX_CHARS + 1),
          presentStudentIds: [],
          capture: { image: await samplePhoto(), mimeType: "image/jpeg", ...INSIDE_CAMPUS, capturedAt: new Date(), address: null, deviceInfo: null },
        }),
      ).rejects.toThrow(DomainError);
    });

    it("refuses when the caller is neither the team's mentor nor its department HOD", async () => {
      const mentor = await makeMentor();
      const { team } = await makeApprovedTeam(env, { mentor });
      const strangerMentor = await makeMentor();

      await expect(
        submitMeeting(strangerMentor, {
          teamId: team.id,
          discussion: "Not your team.",
          presentStudentIds: [],
          capture: { image: await samplePhoto(), mimeType: "image/jpeg", ...INSIDE_CAMPUS, capturedAt: new Date(), address: null, deviceInfo: null },
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it("refuses attendance for a student who is not a registered member of the team", async () => {
      const mentor = await makeMentor();
      const { team } = await makeApprovedTeam(env, { mentor });
      const { members: otherTeamMembers } = await makeApprovedTeam(env, { mentor });

      await expect(
        submitMeeting(mentor, {
          teamId: team.id,
          discussion: "Attendance for the wrong team.",
          presentStudentIds: [otherTeamMembers[0].studentProfileId!],
          capture: { image: await samplePhoto(), mimeType: "image/jpeg", ...INSIDE_CAMPUS, capturedAt: new Date(), address: null, deviceInfo: null },
        }),
      ).rejects.toThrow(/registered team members/);
    });

    it("keeps the attendance name snapshot unchanged even if the student's profile name changes later", async () => {
      const mentor = await makeMentor();
      const { team, members } = await makeApprovedTeam(env, { mentor });

      const meeting = await submitMeeting(mentor, {
        teamId: team.id,
        discussion: "Snapshot immutability check.",
        presentStudentIds: [members[0].studentProfileId!],
        capture: { image: await samplePhoto(), mimeType: "image/jpeg", ...INSIDE_CAMPUS, capturedAt: new Date(), address: null, deviceInfo: null },
      });

      const before = await db.meetingAttendance.findFirstOrThrow({
        where: { meetingId: meeting.id, studentId: members[0].studentProfileId! },
      });

      // Rename the underlying user record after the fact.
      await db.user.update({ where: { id: members[0].userId }, data: { name: "A Completely Different Name" } });

      const after = await db.meetingAttendance.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.nameSnapshot).toBe(before.nameSnapshot);
      expect(after.nameSnapshot).not.toBe("A Completely Different Name");
    });
  });

  describe("decideMeeting", () => {
    async function submitPending(mentor: Awaited<ReturnType<typeof makeUser>>, teamId: string) {
      return submitMeeting(mentor, {
        teamId,
        discussion: "Awaiting approval.",
        presentStudentIds: [],
        capture: { image: await samplePhoto(), mimeType: "image/jpeg", ...INSIDE_CAMPUS, capturedAt: new Date(), address: null, deviceInfo: null },
      });
    }

    it("requires a reason for rejection or resubmission but not for approval", async () => {
      const mentor = await makeMentor();
      const { team } = await makeApprovedTeam(env, { mentor });
      const meeting = await submitPending(mentor, team.id);
      const hod = await makeUser({ roles: [{ role: "HOD", departmentId: env.department.id }] });

      await expect(decideMeeting(hod, meeting.id, "REJECT")).rejects.toThrow(/Give a reason/);

      const approved = await decideMeeting(hod, meeting.id, "APPROVE");
      expect(approved.status).toBe("APPROVED");
    });

    it("records every decision in the approval history without overwriting earlier ones", async () => {
      const mentor = await makeMentor();
      const { team } = await makeApprovedTeam(env, { mentor });
      const meeting = await submitPending(mentor, team.id);
      const hod = await makeUser({ roles: [{ role: "HOD", departmentId: env.department.id }] });

      await decideMeeting(hod, meeting.id, "REQUEST_RESUBMISSION", "Photo is blurry.");
      await decideMeeting(hod, meeting.id, "APPROVE");

      const history = await db.meetingApproval.findMany({ where: { meetingId: meeting.id }, orderBy: { createdAt: "asc" } });
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some((h) => h.action === "REQUEST_RESUBMISSION")).toBe(true);
      expect(history.some((h) => h.action === "APPROVE")).toBe(true);
    });

    it("notifies the mentor of the decision", async () => {
      const mentor = await makeMentor();
      const { team } = await makeApprovedTeam(env, { mentor });
      const meeting = await submitPending(mentor, team.id);
      const hod = await makeUser({ roles: [{ role: "HOD", departmentId: env.department.id }] });

      const before = await db.notification.count({ where: { userId: mentor.userId } });
      await decideMeeting(hod, meeting.id, "REJECT", "Insufficient evidence.");
      const after = await db.notification.count({ where: { userId: mentor.userId } });
      expect(after).toBe(before + 1);
    });
  });
});
