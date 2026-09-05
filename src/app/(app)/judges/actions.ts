"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePrincipal } from "@/lib/auth/session";
import { assertCan } from "@/lib/auth/rbac";
import { grantRole } from "@/lib/services/users";
import { notifyMany } from "@/lib/services/notifications";

export interface JudgeState {
  status: "idle" | "error" | "success";
  message?: string;
}

/** Adds the Judge capability to an existing faculty account. */
export async function makeJudgeAction(_prev: JudgeState, formData: FormData): Promise<JudgeState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "judge.manage");
    const userId = String(formData.get("userId"));

    const faculty = await db.facultyProfile.findFirst({
      where: { userId },
      select: { departmentId: true, user: { select: { name: true } } },
    });
    if (!faculty) return { status: "error", message: "Select a registered faculty member." };

    await grantRole(principal, userId, "JUDGE", faculty.departmentId);
    await notifyMany(db, [userId], {
      kind: "JUDGE_ROLE_GRANTED",
      title: "You can now evaluate project presentations",
      link: "/judge",
    });

    revalidatePath("/judges");
    return { status: "success", message: `${faculty.user.name} can now evaluate presentations.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not grant the role." };
  }
}
