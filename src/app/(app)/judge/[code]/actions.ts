"use server";

import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth/session";
import { saveJudgeMarks } from "@/lib/services/evaluation";

export interface MarksState {
  status: "idle" | "error" | "success";
  message?: string;
}

export async function saveMarksAction(_prev: MarksState, formData: FormData): Promise<MarksState> {
  try {
    const principal = await requirePrincipal();
    const presentationTeamId = String(formData.get("presentationTeamId"));
    const submit = formData.get("intent") === "submit";
    const remarks = String(formData.get("remarks") ?? "");

    const marks: { criterionId: string; value: number }[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("mark:")) continue;
      const raw = String(value).trim();
      if (raw === "") continue;
      marks.push({ criterionId: key.slice(5), value: Number(raw) });
    }

    await saveJudgeMarks(principal, presentationTeamId, marks, submit, remarks);
    revalidatePath("/judge");
    return {
      status: "success",
      message: submit ? "Marks submitted. Your evaluation is locked." : "Draft saved.",
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not save the marks." };
  }
}
