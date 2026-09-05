"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth/session";
import { assertCan } from "@/lib/auth/rbac";
import { decideMeeting } from "@/lib/services/meetings";

export interface MeetingDecisionState {
  status: "idle" | "error" | "success";
  message?: string;
}

export async function decideMeetingAction(
  _prev: MeetingDecisionState,
  formData: FormData,
): Promise<MeetingDecisionState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "meeting.approve");
    const meetingId = String(formData.get("meetingId"));
    const action = String(formData.get("action"));
    if (action !== "APPROVE" && action !== "REJECT" && action !== "REQUEST_RESUBMISSION") {
      return { status: "error", message: "Unknown action." };
    }
    await decideMeeting(principal, meetingId, action, String(formData.get("reason") ?? ""));
    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath("/meetings");
    return { status: "success", message: "Decision recorded." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not record the decision." };
  }
}
