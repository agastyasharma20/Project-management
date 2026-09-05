"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/session";
import { assertCan } from "@/lib/auth/rbac";
import { ROLES, type Role } from "@/lib/domain/constants";
import { createUser, resetPassword, revokeRole, setUserActive } from "@/lib/services/users";

export interface UserState {
  status: "idle" | "error" | "success";
  message?: string;
}

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8),
  departmentId: z.string().optional(),
  enrollmentNo: z.string().trim().max(30).optional(),
  employeeCode: z.string().trim().max(30).optional(),
  designation: z.string().trim().max(80).optional(),
  sectionId: z.string().optional(),
  semesterId: z.string().optional(),
});

export async function createUserAction(_prev: UserState, formData: FormData): Promise<UserState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "user.write");

    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

    const roles = formData
      .getAll("roles")
      .map(String)
      .filter((r): r is Role => (ROLES as readonly string[]).includes(r));
    if (!roles.length) return { status: "error", message: "Select at least one role." };

    const user = await createUser(principal, {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      password: parsed.data.password,
      roles,
      departmentId: parsed.data.departmentId || null,
      enrollmentNo: parsed.data.enrollmentNo,
      employeeCode: parsed.data.employeeCode,
      designation: parsed.data.designation,
      sectionId: parsed.data.sectionId || null,
      semesterId: parsed.data.semesterId || null,
    });

    revalidatePath("/users");
    return { status: "success", message: `${user.email} created.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not create the user." };
  }
}

export async function toggleUserAction(_prev: UserState, formData: FormData): Promise<UserState> {
  try {
    const principal = await requirePrincipal();
    await setUserActive(principal, String(formData.get("userId")), formData.get("active") === "true");
    revalidatePath("/users");
    return { status: "success", message: "Account updated." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not update the account." };
  }
}

export async function resetPasswordAction(_prev: UserState, formData: FormData): Promise<UserState> {
  try {
    const principal = await requirePrincipal();
    await resetPassword(principal, String(formData.get("userId")), String(formData.get("password")));
    revalidatePath("/users");
    return { status: "success", message: "Password reset. Existing sessions were signed out." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not reset the password." };
  }
}

export async function revokeRoleAction(_prev: UserState, formData: FormData): Promise<UserState> {
  try {
    const principal = await requirePrincipal();
    await revokeRole(principal, String(formData.get("userRoleId")));
    revalidatePath("/users");
    return { status: "success", message: "Role revoked." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not revoke the role." };
  }
}
