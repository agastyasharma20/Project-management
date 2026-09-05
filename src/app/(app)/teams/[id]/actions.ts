"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/session";
import { assertCan } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import {
  addMember,
  DomainError,
  reassignMentor,
  removeMember,
  setArchived,
  updateTeam,
} from "@/lib/services/teams";
import { recordAudit } from "@/lib/services/audit";

export interface ActionState {
  status: "idle" | "error" | "success";
  message?: string;
}

function fail(error: unknown): ActionState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "The action could not be completed.",
  };
}

export async function reassignMentorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "team.mentor.assign");
    const teamId = String(formData.get("teamId"));
    await reassignMentor(principal, teamId, String(formData.get("mentorUserId")));
    revalidatePath(`/teams/${teamId}`);
    return { status: "success", message: "Mentor updated." };
  } catch (error) {
    return fail(error);
  }
}

export async function updateTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "team.write");
    const schema = z.object({
      teamId: z.string().min(1),
      projectTitle: z.string().trim().min(4).max(180),
      projectDescription: z.string().trim().min(10).max(4000),
      sectionId: z.string().optional(),
      semesterId: z.string().min(1),
      projectTypeId: z.string().min(1),
      status: z.enum(["REGISTERED", "ACTIVE", "COMPLETED", "ARCHIVED"]),
    });
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

    await updateTeam(principal, parsed.data.teamId, {
      projectTitle: parsed.data.projectTitle,
      projectDescription: parsed.data.projectDescription,
      sectionId: parsed.data.sectionId || null,
      semesterId: parsed.data.semesterId,
      projectTypeId: parsed.data.projectTypeId,
      status: parsed.data.status,
    });
    revalidatePath(`/teams/${parsed.data.teamId}`);
    return { status: "success", message: "Project details saved." };
  } catch (error) {
    return fail(error);
  }
}

export async function addMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "team.write");
    const teamId = String(formData.get("teamId"));
    await addMember(principal, teamId, String(formData.get("enrollmentNo")));
    revalidatePath(`/teams/${teamId}`);
    return { status: "success", message: "Member added." };
  } catch (error) {
    return fail(error);
  }
}

export async function removeMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "team.write");
    const teamId = String(formData.get("teamId"));
    await removeMember(principal, teamId, String(formData.get("memberId")));
    revalidatePath(`/teams/${teamId}`);
    return { status: "success", message: "Member removed." };
  } catch (error) {
    return fail(error);
  }
}

export async function archiveTeamAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "team.archive");
    const teamId = String(formData.get("teamId"));
    await setArchived(principal, teamId, formData.get("archived") === "true");
    revalidatePath(`/teams/${teamId}`);
    return { status: "success", message: "Archive state updated." };
  } catch (error) {
    return fail(error);
  }
}

const resourceSchema = z.object({
  teamId: z.string().min(1),
  categoryId: z.string().min(1),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional(),
  url: z.string().trim().url("Enter a valid URL including https://").max(600),
});

export async function addResourceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "resource.write");
    const parsed = resourceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

    const url = new URL(parsed.data.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      return { status: "error", message: "Only http(s) links are allowed." };
    }

    const team = await db.team.findUniqueOrThrow({
      where: { id: parsed.data.teamId },
      select: { id: true, departmentId: true, members: { where: { removedAt: null }, select: { studentId: true } } },
    });

    // Students may only manage resources for their own team.
    if (principal.roles.includes("STUDENT") && principal.studentProfileId) {
      const isMember = team.members.some((m) => m.studentId === principal.studentProfileId);
      if (!isMember) return { status: "error", message: "You can only add resources to your own project." };
    }

    await db.$transaction(async (tx) => {
      const resource = await tx.projectResource.create({
        data: {
          teamId: team.id,
          categoryId: parsed.data.categoryId,
          title: parsed.data.title,
          description: parsed.data.description || null,
          url: parsed.data.url,
          addedByUserId: principal.userId,
        },
      });
      await tx.projectResourceVersion.create({
        data: {
          resourceId: resource.id,
          version: 1,
          title: resource.title,
          url: resource.url,
          description: resource.description,
          changedByUserId: principal.userId,
        },
      });
      await tx.timelineEvent.create({
        data: {
          teamId: team.id,
          kind: "RESOURCE",
          title: "Resource added",
          detail: resource.title,
          actorUserId: principal.userId,
        },
      });
    });

    await recordAudit(principal, {
      action: "RESOURCE_ADDED",
      entity: "Team",
      entityId: team.id,
      summary: `Added resource ${parsed.data.title}`,
    });

    revalidatePath(`/teams/${team.id}`);
    revalidatePath("/my-team");
    return { status: "success", message: "Resource added." };
  } catch (error) {
    return fail(error instanceof DomainError ? error : error);
  }
}
