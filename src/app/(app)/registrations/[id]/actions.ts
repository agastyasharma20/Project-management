"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth/session";
import { assertCan } from "@/lib/auth/rbac";
import { approveRegistration, rejectRegistration } from "@/lib/services/teams";

export interface DecisionState {
  status: "idle" | "error" | "success";
  message?: string;
}

export async function approveAction(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "team.approve");
    const teamId = String(formData.get("teamId"));
    const team = await approveRegistration(principal, teamId);
    revalidatePath(`/registrations/${teamId}`);
    revalidatePath("/registrations");
    return { status: "success", message: `Approved. Team ID ${team.teamId} issued.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Approval failed." };
  }
}

export async function rejectAction(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "team.approve");
    const teamId = String(formData.get("teamId"));
    await rejectRegistration(principal, teamId, String(formData.get("reason") ?? ""));
    revalidatePath(`/registrations/${teamId}`);
    revalidatePath("/registrations");
    return { status: "success", message: "Sent back to the team lead for correction." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Rejection failed." };
  }
}
