"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePrincipal } from "@/lib/auth/session";
import { assertCan, assertDepartment, isCollegeWide } from "@/lib/auth/rbac";
import {
  healthWeightsSchema,
  meetingRulesSchema,
  riskRulesSchema,
  setSetting,
} from "@/lib/services/settings";
import { recordAudit } from "@/lib/services/audit";

export interface ConfigState {
  status: "idle" | "error" | "success";
  message?: string;
}

const ok = (message: string): ConfigState => ({ status: "success", message });
const fail = (error: unknown): ConfigState => ({
  status: "error",
  message: error instanceof Error ? error.message : "Could not save the configuration.",
});

export async function saveGeofenceAction(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "geofence.write");

    const schema = z.object({
      name: z.string().trim().min(2).max(120),
      departmentId: z.string().optional(),
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
      radiusM: z.coerce.number().min(10).max(5000),
      minAccuracyM: z.coerce.number().min(5).max(500),
      goodAccuracyM: z.coerce.number().min(1).max(500),
      warnAccuracyM: z.coerce.number().min(1).max(500),
      enforce: z.string().optional(),
    });
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

    const departmentId = parsed.data.departmentId || null;
    if (departmentId) assertDepartment(principal, departmentId);
    if (!departmentId && !isCollegeWide(principal)) {
      return { status: "error", message: "Only college-wide administrators can change the campus-wide anchor." };
    }
    if (parsed.data.goodAccuracyM > parsed.data.warnAccuracyM) {
      return { status: "error", message: "The 'good' accuracy threshold must be tighter than the warning threshold." };
    }

    const data = {
      name: parsed.data.name,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      radiusM: parsed.data.radiusM,
      minAccuracyM: parsed.data.minAccuracyM,
      goodAccuracyM: parsed.data.goodAccuracyM,
      warnAccuracyM: parsed.data.warnAccuracyM,
      enforce: parsed.data.enforce === "on",
    };

    const existing = await db.geofenceConfig.findFirst({ where: { departmentId } });
    if (existing) await db.geofenceConfig.update({ where: { id: existing.id }, data });
    else await db.geofenceConfig.create({ data: { ...data, departmentId } });

    await recordAudit(principal, {
      action: "GEOFENCE_UPDATED",
      entity: "GeofenceConfig",
      entityId: existing?.id ?? null,
      summary: `Geofence for ${departmentId ? "department" : "campus"} set to ${data.latitude}, ${data.longitude} @ ${data.radiusM}m`,
      before: existing,
      after: data,
    });

    revalidatePath("/configuration");
    return ok("Geofence saved.");
  } catch (error) {
    return fail(error);
  }
}

export async function saveAnalyticsAction(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "analytics.config.write");

    const weights = healthWeightsSchema.parse({
      meetingActivity: Number(formData.get("meetingActivity")),
      attendance: Number(formData.get("attendance")),
      presentation: Number(formData.get("presentation")),
      progress: Number(formData.get("progress")),
      repository: Number(formData.get("repository")),
    });
    const sum = Object.values(weights).reduce((s, v) => s + v, 0);
    if (Math.round(sum) !== 100) {
      return { status: "error", message: `Health weights must add up to 100 (currently ${sum}).` };
    }

    const risks = riskRulesSchema.parse({
      maxDaysWithoutMeeting: Number(formData.get("maxDaysWithoutMeeting")),
      minAttendancePct: Number(formData.get("minAttendancePct")),
      maxRejectedMeetings: Number(formData.get("maxRejectedMeetings")),
      minPresentationPct: Number(formData.get("minPresentationPct")),
      requireRepositoryLinks: formData.get("requireRepositoryLinks") === "on",
    });

    await setSetting("analytics.healthWeights", weights);
    await setSetting("analytics.riskRules", risks);

    await recordAudit(principal, {
      action: "ANALYTICS_CONFIG_UPDATED",
      entity: "Setting",
      summary: "Updated health weights and risk thresholds",
      after: { weights, risks },
    });

    revalidatePath("/configuration");
    return ok("Analytics configuration saved.");
  } catch (error) {
    return fail(error);
  }
}

export async function saveMeetingRulesAction(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "config.write");

    const rules = meetingRulesSchema.parse({
      frequency: String(formData.get("frequency")),
      intervalDays: Number(formData.get("intervalDays")),
      requireApproval: formData.get("requireApproval") === "on",
      approverRoles: formData.getAll("approverRoles").map(String),
      mentorSelfApproves: formData.get("mentorSelfApproves") === "on",
    });
    if (!rules.approverRoles.length && rules.requireApproval) {
      return { status: "error", message: "Choose at least one role that can approve meeting evidence." };
    }

    const departmentId = String(formData.get("departmentId") ?? "") || null;
    if (departmentId) assertDepartment(principal, departmentId);
    await setSetting("meetings.rules", rules, departmentId);

    await recordAudit(principal, {
      action: "MEETING_RULES_UPDATED",
      entity: "Setting",
      summary: `Updated meeting rules (${rules.frequency}, every ${rules.intervalDays} days)`,
      after: rules,
    });

    revalidatePath("/configuration");
    return ok("Meeting rules saved.");
  } catch (error) {
    return fail(error);
  }
}

export async function createAcademicRecordAction(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  try {
    const principal = await requirePrincipal();
    assertCan(principal, "config.write");
    const entity = String(formData.get("entity"));

    switch (entity) {
      case "department": {
        if (!isCollegeWide(principal)) {
          return { status: "error", message: "Only college-wide administrators can add departments." };
        }
        const code = String(formData.get("code") ?? "").trim().toUpperCase();
        const name = String(formData.get("name") ?? "").trim();
        if (!/^[A-Z]{2,8}$/.test(code)) return { status: "error", message: "Use a 2–8 letter department code." };
        await db.department.create({ data: { code, name: name || code } });
        break;
      }
      case "section": {
        const departmentId = String(formData.get("departmentId"));
        assertDepartment(principal, departmentId);
        const name = String(formData.get("name") ?? "").trim();
        if (!name) return { status: "error", message: "Give the section a name." };
        await db.section.create({ data: { departmentId, name } });
        break;
      }
      case "academicYear": {
        if (!isCollegeWide(principal)) {
          return { status: "error", message: "Only college-wide administrators can add academic years." };
        }
        const label = String(formData.get("label") ?? "").trim();
        const startsOn = new Date(String(formData.get("startsOn")));
        const endsOn = new Date(String(formData.get("endsOn")));
        if (!label || Number.isNaN(startsOn.getTime()) || Number.isNaN(endsOn.getTime())) {
          return { status: "error", message: "Provide a label and both dates." };
        }
        await db.academicYear.create({ data: { label, startsOn, endsOn } });
        break;
      }
      case "academicConfig": {
        const academicYearId = String(formData.get("academicYearId"));
        const semesterId = String(formData.get("semesterId"));
        const projectTypeId = String(formData.get("projectTypeId"));
        const expectedMeetings = Number(formData.get("expectedMeetings")) || 12;
        const existing = await db.academicConfiguration.findUnique({
          where: { academicYearId_semesterId: { academicYearId, semesterId } },
        });
        if (existing) {
          await db.academicConfiguration.update({
            where: { id: existing.id },
            data: { projectTypeId, expectedMeetings },
          });
        } else {
          await db.academicConfiguration.create({
            data: { academicYearId, semesterId, projectTypeId, expectedMeetings },
          });
        }
        break;
      }
      default:
        return { status: "error", message: "Unknown configuration entity." };
    }

    await recordAudit(principal, {
      action: "ACADEMIC_CONFIG_CHANGED",
      entity: entity,
      summary: `Configured ${entity}`,
    });
    revalidatePath("/configuration");
    return ok("Configuration saved.");
  } catch (error) {
    return fail(error);
  }
}
