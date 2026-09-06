import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { submitMeeting } from "@/lib/services/meetings";
import {
  computeTeamMetrics,
  rollup,
  studentAttendance,
  summarise,
} from "@/lib/services/analytics";
import { setSetting } from "@/lib/services/settings";
import { buildAcademicEnvironment, makeApprovedTeam, makeUser } from "./fixtures";

const INSIDE_CAMPUS = { latitude: 22.719600, longitude: 75.857800, accuracyM: 8 };

async function samplePhoto(): Promise<Buffer> {
  return sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 5, g: 5, b: 5 } } })
    .jpeg()
    .toBuffer();
}

async function makeMentor(env: Awaited<ReturnType<typeof buildAcademicEnvironment>>) {
  return makeUser({
    roles: [{ role: "FACULTY_MENTOR", departmentId: env.department.id }],
    asFaculty: { departmentId: env.department.id },
  });
}

/** Records N meetings, `presentFraction` of members marked present each time, spaced a day apart. */
async function recordMeetings(
  mentor: Awaited<ReturnType<typeof makeUser>>,
  teamId: string,
  memberIds: string[],
  count: number,
  presentFraction: number,
) {
  for (let i = 0; i < count; i++) {
    const presentCount = Math.round(memberIds.length * presentFraction);
    await submitMeeting(mentor, {
      teamId,
      discussion: `Meeting ${i + 1} of the analytics fixture.`,
      presentStudentIds: memberIds.slice(0, presentCount),
      capture: {
        image: await samplePhoto(),
        mimeType: "image/jpeg",
        ...INSIDE_CAMPUS,
        capturedAt: new Date(Date.now() - (count - i) * 86_400_000),
        address: null,
        deviceInfo: null,
      },
    });
  }
  // Force every recorded meeting to APPROVED so it counts toward "held" —
  // the default rule set leaves faculty-mentor submissions pending.
  await db.meeting.updateMany({ where: { teamId }, data: { status: "APPROVED" } });
}

describe("analytics service", () => {
  let env: Awaited<ReturnType<typeof buildAcademicEnvironment>>;

  beforeAll(async () => {
    env = await buildAcademicEnvironment();
    // Deterministic health weights and risk thresholds for this test's math.
    await setSetting("analytics.healthWeights", {
      meetingActivity: 20,
      attendance: 20,
      presentation: 25,
      progress: 20,
      repository: 15,
    });
    await setSetting("analytics.riskRules", {
      maxDaysWithoutMeeting: 14,
      minAttendancePct: 70,
      maxRejectedMeetings: 2,
      minPresentationPct: 60,
      requireRepositoryLinks: true,
    });
  });

  describe("computeTeamMetrics", () => {
    it("reports zero meetings and a 'no meeting recorded yet' risk for a freshly approved team", async () => {
      const mentor = await makeMentor(env);
      const { team } = await makeApprovedTeam(env, { mentor });

      const [metrics] = await computeTeamMetrics({ id: team.id });
      expect(metrics.meetingsHeld).toBe(0);
      expect(metrics.attendancePct).toBeNull();
      expect(metrics.atRisk).toBe(true);
      expect(metrics.risks).toContain("No meeting recorded yet");
    });

    it("computes attendance percentage from real recorded meetings", async () => {
      const mentor = await makeMentor(env);
      const { team, members } = await makeApprovedTeam(env, { mentor, memberCount: 4 });
      const memberIds = members.map((m) => m.studentProfileId!);

      // Every meeting: all 4 present except the 4th meeting where only 1 is
      // present -> 13/16 slots present = 81.25%.
      await recordMeetings(mentor, team.id, memberIds, 3, 1);
      await recordMeetings(mentor, team.id, memberIds, 1, 0.25);

      // Publish enough resource categories (>=50% of the required set) so the
      // "missing repository links" rule — a separate, deliberately independent
      // risk — does not also fire and confound this attendance-only assertion.
      const github = await db.resourceCategory.upsert({
        where: { code: "GITHUB" },
        update: {},
        create: { code: "GITHUB", name: "GitHub" },
      });
      const drive = await db.resourceCategory.upsert({
        where: { code: "DRIVE" },
        update: {},
        create: { code: "DRIVE", name: "Google Drive" },
      });
      await db.projectResource.createMany({
        data: [github, drive].map((category) => ({
          teamId: team.id,
          categoryId: category.id,
          title: category.name,
          url: `https://example.test/${category.code.toLowerCase()}`,
          addedByUserId: mentor.userId,
        })),
      });

      const [metrics] = await computeTeamMetrics({ id: team.id });
      expect(metrics.meetingsHeld).toBe(4);
      expect(metrics.attendancePct).toBeCloseTo(81.25, 2);
      expect(metrics.risks.some((r) => r.startsWith("Attendance:"))).toBe(false);
      expect(metrics.atRisk).toBe(false); // 81.25% attendance, 50% resources, recent meeting — nothing to flag
    });

    it("flags low attendance as a risk once it drops below the configured threshold", async () => {
      const mentor = await makeMentor(env);
      const { team, members } = await makeApprovedTeam(env, { mentor, memberCount: 4 });
      await recordMeetings(mentor, team.id, members.map((m) => m.studentProfileId!), 3, 0.25); // 25% attendance

      const [metrics] = await computeTeamMetrics({ id: team.id });
      expect(metrics.attendancePct).toBeCloseTo(25, 2);
      expect(metrics.atRisk).toBe(true);
      expect(metrics.risks.some((r) => r.startsWith("Attendance:"))).toBe(true);
    });

    it("flags a missing-repository risk until GitHub/Drive/Presentation/Report resources exist", async () => {
      const mentor = await makeMentor(env);
      const { team, members } = await makeApprovedTeam(env, { mentor, memberCount: 3 });
      await recordMeetings(mentor, team.id, members.map((m) => m.studentProfileId!), 3, 1);

      const [before] = await computeTeamMetrics({ id: team.id });
      expect(before.resourceCompletenessPct).toBe(0);
      expect(before.risks).toContain("Missing project repository links");

      const github = await db.resourceCategory.upsert({
        where: { code: "GITHUB" },
        update: {},
        create: { code: "GITHUB", name: "GitHub" },
      });
      await db.projectResource.create({
        data: {
          teamId: team.id,
          categoryId: github.id,
          title: "Repo",
          url: "https://github.com/example/repo",
          addedByUserId: mentor.userId,
        },
      });

      const [after] = await computeTeamMetrics({ id: team.id });
      expect(after.resourceCompletenessPct).toBeGreaterThan(before.resourceCompletenessPct);
    });

    it("computes a health score as the configured weighted average, not a fixed formula", async () => {
      const mentor = await makeMentor(env);
      const { team, members } = await makeApprovedTeam(env, { mentor, memberCount: 2 });
      await recordMeetings(mentor, team.id, members.map((m) => m.studentProfileId!), 6, 1); // full attendance, full cadence

      const [metrics] = await computeTeamMetrics({ id: team.id });
      // With full attendance and full meeting cadence, the health score should
      // sit well above the "Needs Attention" band even without a presentation.
      expect(metrics.healthScore).toBeGreaterThanOrEqual(60);
      expect(metrics.healthScore).toBeLessThanOrEqual(100);
    });
  });

  describe("rollup / summarise", () => {
    it("aggregates multiple teams into a department-level rollup", async () => {
      const mentor = await makeMentor(env);
      const { team: teamA, members: membersA } = await makeApprovedTeam(env, { mentor, memberCount: 2 });
      const { team: teamB, members: membersB } = await makeApprovedTeam(env, { mentor, memberCount: 2 });
      await recordMeetings(mentor, teamA.id, membersA.map((m) => m.studentProfileId!), 2, 1);
      await recordMeetings(mentor, teamB.id, membersB.map((m) => m.studentProfileId!), 2, 0.5);

      const metrics = await computeTeamMetrics({ id: { in: [teamA.id, teamB.id] } });
      const byDept = rollup(metrics, (m) => ({ key: m.departmentId, label: m.departmentCode }));
      const bucket = byDept.find((b) => b.key === env.department.id)!;

      expect(bucket.teams).toBe(2);
      expect(bucket.students).toBe(4);
      // Average of 100% and 50% attendance.
      expect(bucket.attendancePct).toBeCloseTo(75, 1);

      const totals = summarise(metrics);
      expect(totals.teams).toBe(2);
      expect(totals.meetings).toBe(4);
    });

    it("returns null aggregate percentages when no team in the bucket has any data", () => {
      const empty = summarise([]);
      expect(empty.teams).toBe(0);
      expect(empty.attendancePct).toBeNull();
      expect(empty.presentationPct).toBeNull();
      expect(empty.healthScore).toBe(0);
    });
  });

  describe("studentAttendance", () => {
    it("computes per-student attendance and excludes rejected meetings", async () => {
      const mentor = await makeMentor(env);
      const { team, members } = await makeApprovedTeam(env, { mentor, memberCount: 2 });
      const memberIds = members.map((m) => m.studentProfileId!);

      await submitMeeting(mentor, {
        teamId: team.id,
        discussion: "Counted meeting.",
        presentStudentIds: [memberIds[0]],
        capture: { image: await samplePhoto(), mimeType: "image/jpeg", ...INSIDE_CAMPUS, capturedAt: new Date(), address: null, deviceInfo: null },
      });
      const rejectedMeeting = await submitMeeting(mentor, {
        teamId: team.id,
        discussion: "Rejected meeting — should not count.",
        presentStudentIds: memberIds,
        capture: { image: await samplePhoto(), mimeType: "image/jpeg", ...INSIDE_CAMPUS, capturedAt: new Date(), address: null, deviceInfo: null },
      });
      await db.meeting.update({ where: { id: rejectedMeeting.id }, data: { status: "REJECTED" } });

      const rows = await studentAttendance([team.id]);
      const first = rows.find((r) => r.studentId === memberIds[0])!;
      const second = rows.find((r) => r.studentId === memberIds[1])!;

      // Only the non-rejected meeting counts: student 0 was present in it,
      // student 1 was not.
      expect(first.total).toBe(1);
      expect(first.present).toBe(1);
      expect(second.total).toBe(1);
      expect(second.present).toBe(0);
    });
  });
});
