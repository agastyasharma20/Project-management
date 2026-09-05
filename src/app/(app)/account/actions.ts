"use server";

import { db } from "@/lib/db";
import { requirePrincipal } from "@/lib/auth/session";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/services/audit";

export interface PasswordState {
  status: "idle" | "error" | "success";
  message?: string;
}

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  try {
    const principal = await requirePrincipal();
    const current = String(formData.get("currentPassword") ?? "");
    const next = String(formData.get("newPassword") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");

    if (next !== confirm) return { status: "error", message: "The new passwords do not match." };
    const problems = passwordProblems(next);
    if (problems.length) return { status: "error", message: `Password must contain ${problems.join(", ")}.` };

    const user = await db.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(current, user.passwordHash))) {
      return { status: "error", message: "Your current password is incorrect." };
    }

    await db.user.update({
      where: { id: principal.userId },
      data: { passwordHash: await hashPassword(next), mustReset: false },
    });
    await recordAudit(principal, {
      action: "PASSWORD_CHANGED",
      entity: "User",
      entityId: principal.userId,
      summary: "Changed own password",
    });

    return { status: "success", message: "Password updated." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not change the password." };
  }
}
