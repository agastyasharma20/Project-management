"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePrincipal } from "@/lib/auth/session";
import { assertCan, assertDepartment } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/services/audit";
import { notifyMany } from "@/lib/services/notifications";
import { setMarksVisibility, reopenSubmission } from "@/lib/services/evaluation";

export interface PresentationState {
  status: "idle" | "error" | "success";
  message?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
  academicYearId: z.string().min(1),
  departmentId: z.string().optional(),
  semesterId: z.string().optional(),
  projectTypeId: z.string().optional(),
  schemeId: z.string().optional(),
  scheduledOn: z.coerce.date(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  venue: z.string().trim().max(120).optional(),
});

export async function createPresentationAction(
  _prev: PresentationState,
  formData: FormData,
): Promise<PresentationState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "presentation.write");
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
    if (parsed.data.departmentId) assertDepartment(principal, parsed.data.departmentId);

    const created = await db.presentation.create({
      data: {
        name: parsed.data.name,
        academicYearId: parsed.data.academicYearId,
        departmentId: parsed.data.departmentId || null,
        semesterId: parsed.data.semesterId || null,
        projectTypeId: parsed.data.projectTypeId || null,
        schemeId: parsed.data.schemeId || null,
        scheduledOn: parsed.data.scheduledOn,
        startTime: parsed.data.startTime || null,
        endTime: parsed.data.endTime || null,
        venue: parsed.data.venue || null,
        status: "SCHEDULED",
      },
    });

    await recordAudit(principal, {
      action: "PRESENTATION_CREATED",
      entity: "Presentation",
      entityId: created.id,
      summary: `Created presentation ${created.name}`,
    });
    revalidatePath("/presentations");
    return { status: "success", message: `${created.name} created.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not create the event." };
  }
}

/** Schedules every eligible team (matching the event's filters) in one action. */
export async function autoScheduleTeamsAction(
  _prev: PresentationState,
  formData: FormData,
): Promise<PresentationState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "presentation.write");
    const presentationId = String(formData.get("presentationId"));
    const presentation = await db.presentation.findUniqueOrThrow({ where: { id: presentationId } });
    if (presentation.departmentId) assertDepartment(principal, presentation.departmentId);

    const teams = await db.team.findMany({
      where: {
        registrationStatus: "APPROVED",
        status: { not: "ARCHIVED" },
        academicYearId: presentation.academicYearId,
        ...(presentation.departmentId ? { departmentId: presentation.departmentId } : {}),
        ...(presentation.semesterId ? { semesterId: presentation.semesterId } : {}),
        ...(presentation.projectTypeId ? { projectTypeId: presentation.projectTypeId } : {}),
      },
      select: { id: true, teamId: true },
      orderBy: { teamId: "asc" },
    });

    let added = 0;
    for (const [index, team] of teams.entries()) {
      const existing = await db.presentationTeam.findUnique({
        where: { presentationId_teamId: { presentationId, teamId: team.id } },
      });
      if (existing) continue;
      await db.presentationTeam.create({
        data: { presentationId, teamId: team.id, sortOrder: index },
      });
      added += 1;
    }

    const students = await db.studentProfile.findMany({
      where: { memberships: { some: { removedAt: null, team: { presentationSlots: { some: { presentationId } } } } } },
      select: { userId: true },
    });
    await notifyMany(db, students.map((s) => s.userId), {
      kind: "PRESENTATION_SCHEDULED",
      title: `Presentation scheduled — ${presentation.name}`,
      link: "/my-team",
    });

    await recordAudit(principal, {
      action: "PRESENTATION_TEAMS_SCHEDULED",
      entity: "Presentation",
      entityId: presentationId,
      summary: `Scheduled ${added} team(s) into ${presentation.name}`,
    });
    revalidatePath(`/presentations/${presentationId}`);
    return { status: "success", message: `${added} team(s) scheduled.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not schedule teams." };
  }
}

export async function assignJudgeAction(_prev: PresentationState, formData: FormData): Promise<PresentationState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "judge.manage");
    const presentationId = String(formData.get("presentationId"));
    const judgeUserId = String(formData.get("judgeUserId"));

    const existing = await db.judgeAssignment.findUnique({
      where: { presentationId_judgeUserId: { presentationId, judgeUserId } },
    });
    if (!existing) {
      await db.judgeAssignment.create({ data: { presentationId, judgeUserId } });
      await notifyMany(db, [judgeUserId], {
        kind: "JUDGE_ASSIGNED",
        title: "You have been assigned as a judge",
        link: "/judge",
      });
      await recordAudit(principal, {
        action: "JUDGE_ASSIGNED",
        entity: "Presentation",
        entityId: presentationId,
        summary: "Assigned a judge to the presentation",
      });
    }
    revalidatePath(`/presentations/${presentationId}`);
    return { status: "success", message: "Judge assigned." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not assign the judge." };
  }
}

export async function setVisibilityAction(_prev: PresentationState, formData: FormData): Promise<PresentationState> {
  try {
    const principal = await requirePrincipal();
    const presentationId = String(formData.get("presentationId"));
    const visibility = String(formData.get("visibility"));
    const allowed = ["DRAFT", "SUBMITTED", "REVIEWED", "PUBLISHED"] as const;
    if (!allowed.includes(visibility as (typeof allowed)[number])) {
      return { status: "error", message: "Unknown visibility state." };
    }
    await setMarksVisibility(principal, presentationId, visibility as (typeof allowed)[number]);
    revalidatePath(`/presentations/${presentationId}`);
    return { status: "success", message: `Marks visibility set to ${visibility.toLowerCase()}.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not update visibility." };
  }
}

export async function reopenSubmissionAction(
  _prev: PresentationState,
  formData: FormData,
): Promise<PresentationState> {
  try {
    const principal = await requirePrincipal();
    await reopenSubmission(principal, String(formData.get("submissionId")));
    revalidatePath(`/presentations/${String(formData.get("presentationId"))}`);
    return { status: "success", message: "Submission reopened for correction." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not reopen." };
  }
}
