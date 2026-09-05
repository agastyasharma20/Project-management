"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePrincipal } from "@/lib/auth/session";
import { assertCan, assertDepartment } from "@/lib/auth/rbac";
import { recordAudit } from "@/lib/services/audit";

export interface SchemeState {
  status: "idle" | "error" | "success";
  message?: string;
}

const criterionSchema = z.object({
  label: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).optional(),
  maxMarks: z.number().int().min(1).max(200),
  weight: z.number().min(0).max(100),
});

export async function createSchemeAction(_prev: SchemeState, formData: FormData): Promise<SchemeState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "scheme.write");

    const name = String(formData.get("name") ?? "").trim();
    const departmentId = String(formData.get("departmentId") ?? "") || null;
    const projectTypeId = String(formData.get("projectTypeId") ?? "") || null;
    const declaredTotal = Number(formData.get("totalMarks"));
    if (departmentId) assertDepartment(principal, departmentId);
    if (name.length < 3) return { status: "error", message: "Give the scheme a name." };

    const labels = formData.getAll("criterionLabel").map(String);
    const descriptions = formData.getAll("criterionDescription").map(String);
    const maxima = formData.getAll("criterionMax").map((v) => Number(v));
    const weights = formData.getAll("criterionWeight").map((v) => Number(v));

    const criteria = [];
    for (let i = 0; i < labels.length; i++) {
      if (!labels[i]?.trim()) continue;
      const parsed = criterionSchema.safeParse({
        label: labels[i],
        description: descriptions[i] || undefined,
        maxMarks: maxima[i],
        weight: Number.isFinite(weights[i]) ? weights[i] : 1,
      });
      if (!parsed.success) {
        return { status: "error", message: `Criterion ${i + 1}: ${parsed.error.issues[0]?.message}` };
      }
      criteria.push(parsed.data);
    }

    if (criteria.length < 2) return { status: "error", message: "Add at least two criteria." };

    const sum = criteria.reduce((s, c) => s + c.maxMarks, 0);
    if (Number.isFinite(declaredTotal) && declaredTotal > 0 && sum !== declaredTotal) {
      return {
        status: "error",
        message: `Criteria add up to ${sum}, but the declared total is ${declaredTotal}. Fix one of them.`,
      };
    }

    const existing = await db.markingScheme.findFirst({ where: { name, departmentId } });
    if (existing) return { status: "error", message: "A scheme with this name already exists for that scope." };

    const scheme = await db.markingScheme.create({
      data: {
        name,
        departmentId,
        projectTypeId,
        totalMarks: sum,
        criteria: {
          create: criteria.map((c, index) => ({
            label: c.label,
            description: c.description ?? null,
            maxMarks: c.maxMarks,
            weight: c.weight,
            sortOrder: index,
          })),
        },
      },
    });

    await recordAudit(principal, {
      action: "MARKING_SCHEME_CREATED",
      entity: "MarkingScheme",
      entityId: scheme.id,
      summary: `Created marking scheme ${name} (total ${sum})`,
    });

    revalidatePath("/schemes");
    return { status: "success", message: `${name} created with a total of ${sum} marks.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not create the scheme." };
  }
}
