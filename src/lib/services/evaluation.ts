import { db } from "@/lib/db";
import type { Principal } from "@/lib/auth/rbac";
import { AuthorizationError, can, isCollegeWide } from "@/lib/auth/rbac";
import { DomainError } from "@/lib/services/teams";
import { recordAudit } from "@/lib/services/audit";
import { notifyMany } from "@/lib/services/notifications";

/** Everything a judge is permitted to see about a team, and nothing more. */
export async function judgeTeamView(principal: Principal, teamCode: string) {
  const team = await db.team.findUnique({
    where: { teamId: teamCode.trim().toUpperCase() },
    include: {
      department: { select: { code: true, name: true } },
      section: { select: { name: true } },
      semester: { select: { number: true } },
      projectType: { select: { name: true } },
      mentor: { select: { name: true } },
      members: {
        where: { removedAt: null },
        include: { student: { include: { user: { select: { name: true } } } } },
      },
      resources: {
        where: { isArchived: false },
        include: { category: { select: { code: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      presentationSlots: {
        include: {
          presentation: {
            include: {
              scheme: { include: { criteria: { orderBy: { sortOrder: "asc" } } } },
              judges: { where: { judgeUserId: principal.userId }, select: { id: true } },
            },
          },
          submissions: { where: { judgeUserId: principal.userId }, include: { marks: true } },
        },
      },
    },
  });

  if (!team) throw new DomainError(`No team found with ID ${teamCode.trim().toUpperCase()}.`);

  // A judge only reaches teams scheduled into a presentation they are assigned to.
  const assignedSlots = team.presentationSlots.filter((s) => s.presentation.judges.length > 0);
  if (!assignedSlots.length && !isCollegeWide(principal)) {
    throw new AuthorizationError("You are not assigned as a judge for any presentation involving this team.");
  }

  return { team, slots: assignedSlots.length ? assignedSlots : team.presentationSlots };
}

export interface MarkInput {
  criterionId: string;
  value: number;
}

export async function saveJudgeMarks(
  principal: Principal,
  presentationTeamId: string,
  marks: MarkInput[],
  submit: boolean,
  remarks?: string,
) {
  if (!can(principal, "marks.enter")) throw new AuthorizationError("Only assigned judges can enter marks.");

  const slot = await db.presentationTeam.findUniqueOrThrow({
    where: { id: presentationTeamId },
    include: {
      team: { select: { id: true, teamId: true, departmentId: true } },
      presentation: {
        include: {
          scheme: { include: { criteria: true } },
          judges: { where: { judgeUserId: principal.userId } },
        },
      },
    },
  });

  if (!slot.presentation.judges.length) {
    throw new AuthorizationError("You are not assigned to this presentation.");
  }
  if (!slot.presentation.scheme) {
    throw new DomainError("No marking scheme is attached to this presentation yet.");
  }
  if (slot.presentation.status === "CANCELLED") throw new DomainError("This presentation was cancelled.");

  const criteria = new Map(slot.presentation.scheme.criteria.map((c) => [c.id, c]));
  for (const mark of marks) {
    const criterion = criteria.get(mark.criterionId);
    if (!criterion) throw new DomainError("Unknown marking criterion in submission.");
    if (!Number.isFinite(mark.value) || mark.value < 0) throw new DomainError(`${criterion.label}: marks cannot be negative.`);
    if (mark.value > criterion.maxMarks) {
      throw new DomainError(`${criterion.label}: maximum is ${criterion.maxMarks}.`);
    }
  }

  const existing = await db.judgeSubmission.findUnique({
    where: { presentationTeamId_judgeUserId: { presentationTeamId, judgeUserId: principal.userId } },
  });
  if (existing?.status === "SUBMITTED" && !existing.reopenedAt) {
    throw new DomainError("You have already submitted marks for this team. Ask an administrator to reopen it.");
  }
  if (submit && marks.length !== slot.presentation.scheme.criteria.length) {
    throw new DomainError("Enter a mark for every criterion before submitting.");
  }

  const total = marks.reduce((s, m) => s + m.value, 0);
  const maxMarks = slot.presentation.scheme.totalMarks;

  const submission = await db.$transaction(async (tx) => {
    const saved = await tx.judgeSubmission.upsert({
      where: { presentationTeamId_judgeUserId: { presentationTeamId, judgeUserId: principal.userId } },
      create: {
        presentationTeamId,
        judgeUserId: principal.userId,
        status: submit ? "SUBMITTED" : "DRAFT",
        totalMarks: total,
        maxMarks,
        remarks: remarks?.trim() || null,
        submittedAt: submit ? new Date() : null,
      },
      update: {
        status: submit ? "SUBMITTED" : "DRAFT",
        totalMarks: total,
        maxMarks,
        remarks: remarks?.trim() || null,
        submittedAt: submit ? new Date() : null,
        reopenedAt: submit ? null : existing?.reopenedAt ?? null,
      },
    });

    for (const mark of marks) {
      await tx.judgeMark.upsert({
        where: { submissionId_criterionId: { submissionId: saved.id, criterionId: mark.criterionId } },
        create: { submissionId: saved.id, criterionId: mark.criterionId, value: mark.value },
        update: { value: mark.value },
      });
    }

    if (submit) {
      await tx.timelineEvent.create({
        data: {
          teamId: slot.team.id,
          kind: "PRESENTATION",
          title: `${slot.presentation.name} evaluated`,
          detail: `${principal.name} submitted marks`,
          actorUserId: principal.userId,
        },
      });
    }
    return saved;
  });

  if (submit) {
    await recordAudit(principal, {
      action: "JUDGE_MARKS_SUBMITTED",
      entity: "JudgeSubmission",
      entityId: submission.id,
      summary: `${principal.name} submitted ${total}/${maxMarks} for ${slot.team.teamId} in ${slot.presentation.name}`,
    });
  }
  return submission;
}

export async function reopenSubmission(principal: Principal, submissionId: string) {
  if (!can(principal, "presentation.write")) throw new AuthorizationError();
  const submission = await db.judgeSubmission.update({
    where: { id: submissionId },
    data: { reopenedAt: new Date(), status: "DRAFT" },
  });
  await recordAudit(principal, {
    action: "JUDGE_SUBMISSION_REOPENED",
    entity: "JudgeSubmission",
    entityId: submissionId,
    summary: "Reopened a judge submission for correction",
  });
  return submission;
}

export async function setMarksVisibility(
  principal: Principal,
  presentationId: string,
  visibility: "DRAFT" | "SUBMITTED" | "REVIEWED" | "PUBLISHED",
) {
  if (!can(principal, "marks.publish")) throw new AuthorizationError();
  const presentation = await db.presentation.findUniqueOrThrow({ where: { id: presentationId } });

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.presentation.update({
      where: { id: presentationId },
      data: { marksVisibility: visibility },
    });
    if (visibility === "PUBLISHED") {
      const students = await tx.studentProfile.findMany({
        where: { memberships: { some: { removedAt: null, team: { presentationSlots: { some: { presentationId } } } } } },
        select: { userId: true },
      });
      await notifyMany(tx, students.map((s) => s.userId), {
        kind: "MARKS_PUBLISHED",
        title: `Marks published — ${presentation.name}`,
        link: "/my-team/marks",
      });
    }
    return result;
  });

  await recordAudit(principal, {
    action: "MARKS_VISIBILITY_CHANGED",
    entity: "Presentation",
    entityId: presentationId,
    summary: `${presentation.name} marks visibility → ${visibility}`,
    before: { marksVisibility: presentation.marksVisibility },
    after: { marksVisibility: visibility },
  });
  return updated;
}

export interface AggregatedTeamResult {
  presentationTeamId: string;
  teamCode: string | null;
  projectTitle: string;
  judgeCount: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  median: number | null;
  maxMarks: number;
  perJudge: { judge: string; total: number; max: number }[];
}

/** Individual judge submissions are preserved; aggregates are derived on read. */
export async function presentationResults(presentationId: string): Promise<AggregatedTeamResult[]> {
  const slots = await db.presentationTeam.findMany({
    where: { presentationId },
    include: {
      team: { select: { teamId: true, projectTitle: true } },
      submissions: {
        where: { status: "SUBMITTED" },
        include: { judge: { select: { name: true } } },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return slots.map((slot) => {
    const totals = slot.submissions.map((s) => s.totalMarks).sort((a, b) => a - b);
    const maxMarks = slot.submissions[0]?.maxMarks ?? 0;
    return {
      presentationTeamId: slot.id,
      teamCode: slot.team.teamId,
      projectTitle: slot.team.projectTitle,
      judgeCount: totals.length,
      average: totals.length ? totals.reduce((s, v) => s + v, 0) / totals.length : null,
      highest: totals.length ? totals[totals.length - 1] : null,
      lowest: totals.length ? totals[0] : null,
      median: totals.length
        ? totals.length % 2
          ? totals[(totals.length - 1) / 2]
          : (totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2
        : null,
      maxMarks,
      perJudge: slot.submissions.map((s) => ({
        judge: s.judge.name,
        total: s.totalMarks,
        max: s.maxMarks,
      })),
    };
  });
}

/** Criterion-level averages across every submitted evaluation in a presentation. */
export async function criterionAverages(presentationId: string) {
  const marks = await db.judgeMark.findMany({
    where: { submission: { status: "SUBMITTED", presentationTeam: { presentationId } } },
    include: { criterion: { select: { id: true, label: true, maxMarks: true, sortOrder: true } } },
  });

  const buckets = new Map<string, { label: string; max: number; sortOrder: number; values: number[] }>();
  for (const mark of marks) {
    const b =
      buckets.get(mark.criterionId) ??
      { label: mark.criterion.label, max: mark.criterion.maxMarks, sortOrder: mark.criterion.sortOrder, values: [] };
    b.values.push(mark.value);
    buckets.set(mark.criterionId, b);
  }
  return [...buckets.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b) => ({
      label: b.label,
      max: b.max,
      average: b.values.reduce((s, v) => s + v, 0) / b.values.length,
      pct: (b.values.reduce((s, v) => s + v, 0) / b.values.length / b.max) * 100,
    }));
}
