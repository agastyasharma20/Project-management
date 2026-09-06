import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AuthorizationError } from "@/lib/auth/rbac";
import { DomainError } from "@/lib/services/teams";
import {
  criterionAverages,
  judgeTeamView,
  presentationResults,
  reopenSubmission,
  saveJudgeMarks,
  setMarksVisibility,
} from "@/lib/services/evaluation";
import { buildAcademicEnvironment, makeApprovedTeam, makeUser } from "./fixtures";

describe("evaluation service", () => {
  let env: Awaited<ReturnType<typeof buildAcademicEnvironment>>;

  beforeAll(async () => {
    env = await buildAcademicEnvironment();
  });

  async function makeScheme(totalOverride?: number) {
    const scheme = await db.markingScheme.create({
      data: {
        name: `Scheme ${Math.random().toString(36).slice(2, 8)}`,
        totalMarks: totalOverride ?? 100,
        criteria: {
          create: [
            { label: "Problem Understanding", maxMarks: 30, sortOrder: 0 },
            { label: "Implementation", maxMarks: 40, sortOrder: 1 },
            { label: "Presentation", maxMarks: 30, sortOrder: 2 },
          ],
        },
      },
      include: { criteria: { orderBy: { sortOrder: "asc" } } },
    });
    return scheme;
  }

  async function makePresentationWithTeam(scheme: Awaited<ReturnType<typeof makeScheme>>, judges: { userId: string }[]) {
    const mentor = await makeUser({
      roles: [{ role: "FACULTY_MENTOR", departmentId: env.department.id }],
      asFaculty: { departmentId: env.department.id },
    });
    const { team } = await makeApprovedTeam(env, { mentor });

    const presentation = await db.presentation.create({
      data: {
        name: `Presentation ${Math.random().toString(36).slice(2, 8)}`,
        academicYearId: env.academicYear.id,
        schemeId: scheme.id,
        scheduledOn: new Date(),
        status: "SCHEDULED",
        judges: { create: judges.map((j) => ({ judgeUserId: j.userId })) },
      },
    });
    const slot = await db.presentationTeam.create({ data: { presentationId: presentation.id, teamId: team.id } });
    return { presentation, team, slot };
  }

  async function makeJudge() {
    return makeUser({ roles: [{ role: "JUDGE", departmentId: env.department.id }] });
  }

  describe("saveJudgeMarks", () => {
    it("saves a draft without requiring every criterion, then submits once complete", async () => {
      const scheme = await makeScheme();
      const judge = await makeJudge();
      const { slot } = await makePresentationWithTeam(scheme, [judge]);

      const draft = await saveJudgeMarks(judge, slot.id, [{ criterionId: scheme.criteria[0].id, value: 20 }], false);
      expect(draft.status).toBe("DRAFT");

      await expect(
        saveJudgeMarks(judge, slot.id, [{ criterionId: scheme.criteria[0].id, value: 20 }], true),
      ).rejects.toThrow(/every criterion/);

      const submitted = await saveJudgeMarks(
        judge,
        slot.id,
        scheme.criteria.map((c) => ({ criterionId: c.id, value: c.maxMarks })),
        true,
      );
      expect(submitted.status).toBe("SUBMITTED");
      expect(submitted.totalMarks).toBe(100);
    });

    it("rejects a mark above the criterion's maximum", async () => {
      const scheme = await makeScheme();
      const judge = await makeJudge();
      const { slot } = await makePresentationWithTeam(scheme, [judge]);

      await expect(
        saveJudgeMarks(judge, slot.id, [{ criterionId: scheme.criteria[0].id, value: 999 }], false),
      ).rejects.toThrow(/maximum is 30/);
    });

    it("rejects a negative mark", async () => {
      const scheme = await makeScheme();
      const judge = await makeJudge();
      const { slot } = await makePresentationWithTeam(scheme, [judge]);

      await expect(
        saveJudgeMarks(judge, slot.id, [{ criterionId: scheme.criteria[0].id, value: -5 }], false),
      ).rejects.toThrow(/cannot be negative/);
    });

    it("refuses marks from a user who is not assigned as a judge on the presentation", async () => {
      const scheme = await makeScheme();
      const assignedJudge = await makeJudge();
      const unassignedJudge = await makeJudge();
      const { slot } = await makePresentationWithTeam(scheme, [assignedJudge]);

      await expect(
        saveJudgeMarks(unassignedJudge, slot.id, [{ criterionId: scheme.criteria[0].id, value: 10 }], false),
      ).rejects.toThrow(AuthorizationError);
    });

    it("refuses to let an already-submitted evaluation be overwritten silently", async () => {
      const scheme = await makeScheme();
      const judge = await makeJudge();
      const { slot } = await makePresentationWithTeam(scheme, [judge]);

      await saveJudgeMarks(judge, slot.id, scheme.criteria.map((c) => ({ criterionId: c.id, value: 10 })), true);

      await expect(
        saveJudgeMarks(judge, slot.id, scheme.criteria.map((c) => ({ criterionId: c.id, value: 20 })), true),
      ).rejects.toThrow(/already submitted/);
    });

    it("allows resubmission after an administrator reopens the evaluation", async () => {
      const scheme = await makeScheme();
      const judge = await makeJudge();
      const admin = await makeUser({ roles: [{ role: "ADMIN" }] });
      const { slot } = await makePresentationWithTeam(scheme, [judge]);

      const first = await saveJudgeMarks(
        judge,
        slot.id,
        scheme.criteria.map((c) => ({ criterionId: c.id, value: 10 })),
        true,
      );
      await reopenSubmission(admin, first.id);

      const second = await saveJudgeMarks(
        judge,
        slot.id,
        scheme.criteria.map((c) => ({ criterionId: c.id, value: 25 })),
        true,
      );
      expect(second.totalMarks).toBe(75);
    });

    it("preserves each judge's own submission — one judge's marks never overwrite another's", async () => {
      const scheme = await makeScheme();
      const judgeA = await makeJudge();
      const judgeB = await makeJudge();
      const { slot } = await makePresentationWithTeam(scheme, [judgeA, judgeB]);

      await saveJudgeMarks(judgeA, slot.id, scheme.criteria.map((c) => ({ criterionId: c.id, value: 20 })), true);
      await saveJudgeMarks(judgeB, slot.id, scheme.criteria.map((c) => ({ criterionId: c.id, value: 28 })), true);

      const submissions = await db.judgeSubmission.findMany({ where: { presentationTeamId: slot.id } });
      expect(submissions).toHaveLength(2);
      const totals = submissions.map((s) => s.totalMarks).sort((a, b) => a - b);
      expect(totals).toEqual([60, 84]);
    });
  });

  describe("presentationResults aggregation", () => {
    it("computes average, highest, lowest and median across multiple judges without altering originals", async () => {
      const scheme = await makeScheme();
      const judge1 = await makeJudge();
      const judge2 = await makeJudge();
      const judge3 = await makeJudge();
      const { presentation, slot } = await makePresentationWithTeam(scheme, [judge1, judge2, judge3]);

      // Totals: 82, 87, 79 (crafted per-criterion so the sums land exactly there)
      await saveJudgeMarks(judge1, slot.id, [
        { criterionId: scheme.criteria[0].id, value: 28 },
        { criterionId: scheme.criteria[1].id, value: 34 },
        { criterionId: scheme.criteria[2].id, value: 20 },
      ], true);
      await saveJudgeMarks(judge2, slot.id, [
        { criterionId: scheme.criteria[0].id, value: 29 },
        { criterionId: scheme.criteria[1].id, value: 36 },
        { criterionId: scheme.criteria[2].id, value: 22 },
      ], true);
      await saveJudgeMarks(judge3, slot.id, [
        { criterionId: scheme.criteria[0].id, value: 26 },
        { criterionId: scheme.criteria[1].id, value: 33 },
        { criterionId: scheme.criteria[2].id, value: 20 },
      ], true);

      const [result] = await presentationResults(presentation.id);
      expect(result.judgeCount).toBe(3);
      expect(result.highest).toBe(87);
      expect(result.lowest).toBe(79);
      expect(result.median).toBe(82);
      expect(result.average).toBeCloseTo((82 + 87 + 79) / 3, 5);
      expect(result.perJudge).toHaveLength(3);

      // Originals are untouched — refetch each submission individually.
      const submissions = await db.judgeSubmission.findMany({ where: { presentationTeamId: slot.id } });
      expect(submissions.map((s) => s.totalMarks).sort((a, b) => a - b)).toEqual([79, 82, 87]);
    });

    it("excludes drafts from aggregation — only SUBMITTED evaluations count", async () => {
      const scheme = await makeScheme();
      const judge = await makeJudge();
      const { presentation, slot } = await makePresentationWithTeam(scheme, [judge]);

      await saveJudgeMarks(judge, slot.id, [{ criterionId: scheme.criteria[0].id, value: 15 }], false);

      const [result] = await presentationResults(presentation.id);
      expect(result.judgeCount).toBe(0);
      expect(result.average).toBeNull();
    });

    it("computes criterion-level averages across all submitted evaluations", async () => {
      const scheme = await makeScheme();
      const judge1 = await makeJudge();
      const judge2 = await makeJudge();
      const { presentation, slot } = await makePresentationWithTeam(scheme, [judge1, judge2]);

      await saveJudgeMarks(judge1, slot.id, [
        { criterionId: scheme.criteria[0].id, value: 30 },
        { criterionId: scheme.criteria[1].id, value: 40 },
        { criterionId: scheme.criteria[2].id, value: 30 },
      ], true);
      await saveJudgeMarks(judge2, slot.id, [
        { criterionId: scheme.criteria[0].id, value: 20 },
        { criterionId: scheme.criteria[1].id, value: 20 },
        { criterionId: scheme.criteria[2].id, value: 20 },
      ], true);

      const averages = await criterionAverages(presentation.id);
      const understanding = averages.find((a) => a.label === "Problem Understanding")!;
      expect(understanding.average).toBe(25); // (30 + 20) / 2
      expect(understanding.pct).toBeCloseTo((25 / 30) * 100, 5);
    });
  });

  describe("judgeTeamView", () => {
    it("lets an assigned judge see the team by its Team ID", async () => {
      const scheme = await makeScheme();
      const judge = await makeJudge();
      const { team } = await makePresentationWithTeam(scheme, [judge]);

      const view = await judgeTeamView(judge, team.teamId!);
      expect(view.team.id).toBe(team.id);
      expect(view.slots.length).toBeGreaterThan(0);
    });

    it("refuses a judge who is not assigned to any presentation involving this team", async () => {
      const scheme = await makeScheme();
      const assignedJudge = await makeJudge();
      const unassignedJudge = await makeJudge();
      const { team } = await makePresentationWithTeam(scheme, [assignedJudge]);

      await expect(judgeTeamView(unassignedJudge, team.teamId!)).rejects.toThrow(AuthorizationError);
    });

    it("raises a clear error for a Team ID that does not exist", async () => {
      const judge = await makeJudge();
      await expect(judgeTeamView(judge, "PIEMR-ZZZ-999")).rejects.toThrow(DomainError);
    });
  });

  describe("setMarksVisibility", () => {
    it("only a permitted role can change visibility, and publishing notifies team members", async () => {
      const scheme = await makeScheme();
      const judge = await makeJudge();
      const { presentation, team } = await makePresentationWithTeam(scheme, [judge]);

      await expect(setMarksVisibility(judge, presentation.id, "PUBLISHED")).rejects.toThrow(AuthorizationError);

      const admin = await makeUser({ roles: [{ role: "ADMIN" }] });
      const member = await db.teamMember.findFirstOrThrow({ where: { teamId: team.id } });
      const before = await db.notification.count({
        where: { userId: (await db.studentProfile.findUniqueOrThrow({ where: { id: member.studentId } })).userId },
      });

      const updated = await setMarksVisibility(admin, presentation.id, "PUBLISHED");
      expect(updated.marksVisibility).toBe("PUBLISHED");

      const after = await db.notification.count({
        where: { userId: (await db.studentProfile.findUniqueOrThrow({ where: { id: member.studentId } })).userId },
      });
      expect(after).toBe(before + 1);
    });
  });
});
