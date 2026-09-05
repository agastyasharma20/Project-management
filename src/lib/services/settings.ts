import { db } from "@/lib/db";
import { z } from "zod";
import type { GeofenceRules } from "@/lib/geo";

/**
 * Typed settings registry. Each key declares its shape and default, so reads
 * are always well-formed even before an administrator has saved anything.
 */
export const healthWeightsSchema = z.object({
  meetingActivity: z.number().min(0).max(100),
  attendance: z.number().min(0).max(100),
  presentation: z.number().min(0).max(100),
  progress: z.number().min(0).max(100),
  repository: z.number().min(0).max(100),
});
export type HealthWeights = z.infer<typeof healthWeightsSchema>;

export const riskRulesSchema = z.object({
  maxDaysWithoutMeeting: z.number().int().min(1).max(120),
  minAttendancePct: z.number().min(0).max(100),
  maxRejectedMeetings: z.number().int().min(0).max(20),
  minPresentationPct: z.number().min(0).max(100),
  requireRepositoryLinks: z.boolean(),
});
export type RiskRules = z.infer<typeof riskRulesSchema>;

export const meetingRulesSchema = z.object({
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "CUSTOM"]),
  intervalDays: z.number().int().min(1).max(90),
  requireApproval: z.boolean(),
  /** Roles allowed to approve meeting evidence. */
  approverRoles: z.array(z.enum(["FACULTY_MENTOR", "HOD", "ADMIN", "DIRECTOR", "SUPER_ADMIN"])),
  /** Mentor's own submission can auto-satisfy the approval requirement. */
  mentorSelfApproves: z.boolean(),
});
export type MeetingRules = z.infer<typeof meetingRulesSchema>;

const REGISTRY = {
  "analytics.healthWeights": {
    schema: healthWeightsSchema,
    fallback: {
      meetingActivity: 20,
      attendance: 20,
      presentation: 25,
      progress: 20,
      repository: 15,
    } satisfies HealthWeights,
  },
  "analytics.riskRules": {
    schema: riskRulesSchema,
    fallback: {
      maxDaysWithoutMeeting: 14,
      minAttendancePct: 70,
      maxRejectedMeetings: 2,
      minPresentationPct: 60,
      requireRepositoryLinks: true,
    } satisfies RiskRules,
  },
  "meetings.rules": {
    schema: meetingRulesSchema,
    fallback: {
      frequency: "WEEKLY",
      intervalDays: 7,
      requireApproval: true,
      approverRoles: ["FACULTY_MENTOR", "HOD"],
      mentorSelfApproves: false,
    } satisfies MeetingRules,
  },
} as const;

export type SettingKey = keyof typeof REGISTRY;
type SettingValue<K extends SettingKey> = z.infer<(typeof REGISTRY)[K]["schema"]>;

/** Department override wins over the college-wide default. */
export async function getSetting<K extends SettingKey>(
  key: K,
  departmentId?: string | null,
): Promise<SettingValue<K>> {
  const entry = REGISTRY[key];
  const rows = await db.setting.findMany({
    where: {
      key,
      OR: departmentId ? [{ departmentId }, { departmentId: null }] : [{ departmentId: null }],
    },
  });
  const chosen =
    rows.find((r) => r.departmentId === departmentId && departmentId) ??
    rows.find((r) => r.departmentId === null);
  if (!chosen) return entry.fallback as SettingValue<K>;
  const parsed = entry.schema.safeParse(safeJson(chosen.value));
  return (parsed.success ? parsed.data : entry.fallback) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
  departmentId: string | null = null,
): Promise<void> {
  const parsed = REGISTRY[key].schema.parse(value);
  const existing = await db.setting.findFirst({ where: { key, departmentId } });
  if (existing) {
    await db.setting.update({ where: { id: existing.id }, data: { value: JSON.stringify(parsed) } });
  } else {
    await db.setting.create({ data: { key, departmentId, value: JSON.stringify(parsed) } });
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const DEFAULT_GEOFENCE: GeofenceRules = {
  // PIEMR, Indore — replace from Configuration › Geofence on first deployment.
  latitude: 22.719568,
  longitude: 75.857726,
  radiusM: 80,
  minAccuracyM: 50,
  goodAccuracyM: 20,
  warnAccuracyM: 50,
  enforce: true,
};

/** Department anchor if configured, otherwise the college-wide anchor. */
export async function getGeofence(departmentId?: string | null): Promise<GeofenceRules & { id: string | null; name: string }> {
  const rows = await db.geofenceConfig.findMany({
    where: { OR: departmentId ? [{ departmentId }, { departmentId: null }] : [{ departmentId: null }] },
  });
  const chosen =
    rows.find((r) => departmentId && r.departmentId === departmentId) ??
    rows.find((r) => r.departmentId === null);
  if (!chosen) return { ...DEFAULT_GEOFENCE, id: null, name: "PIEMR Campus (built-in default)" };
  return {
    id: chosen.id,
    name: chosen.name,
    latitude: chosen.latitude,
    longitude: chosen.longitude,
    radiusM: chosen.radiusM,
    minAccuracyM: chosen.minAccuracyM,
    goodAccuracyM: chosen.goodAccuracyM,
    warnAccuracyM: chosen.warnAccuracyM,
    enforce: chosen.enforce,
  };
}
