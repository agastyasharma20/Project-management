import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { healthBand } from "@/lib/domain/constants";
import { getSetting, type HealthWeights, type RiskRules } from "@/lib/services/settings";

export interface AnalyticsFilters {
  academicYearId?: string;
  departmentId?: string;
  semesterId?: string;
  sectionId?: string;
  projectTypeId?: string;
  mentorUserId?: string;
}

export function filtersToWhere(
  filters: AnalyticsFilters,
  scope: Prisma.TeamWhereInput = {},
): Prisma.TeamWhereInput {
  return {
    AND: [
      scope,
      { registrationStatus: "APPROVED" },
      filters.academicYearId ? { academicYearId: filters.academicYearId } : {},
      filters.departmentId ? { departmentId: filters.departmentId } : {},
      filters.semesterId ? { semesterId: filters.semesterId } : {},
      filters.sectionId ? { sectionId: filters.sectionId } : {},
      filters.projectTypeId ? { projectTypeId: filters.projectTypeId } : {},
      filters.mentorUserId ? { mentorUserId: filters.mentorUserId } : {},
    ],
  };
}

export interface TeamMetrics {
  teamId: string;
  code: string | null;
  projectTitle: string;
  departmentId: string;
  departmentCode: string;
  sectionId: string | null;
  sectionName: string | null;
  semesterNumber: number;
  projectTypeCode: string;
  mentorUserId: string | null;
  mentorName: string | null;
  memberCount: number;

  meetingsHeld: number;
  meetingsApproved: number;
  meetingsRejected: number;
  expectedMeetings: number;
  lastMeetingAt: Date | null;
  daysSinceLastMeeting: number | null;

  attendancePct: number | null;
  presentationPct: number | null;
  resourceCompletenessPct: number;

  healthScore: number;
  healthLabel: string;
  risks: string[];
  atRisk: boolean;
}

const REQUIRED_RESOURCE_CODES = ["GITHUB", "DRIVE", "PRESENTATION", "REPORT"];

/**
 * The single source of truth for team-level metrics. Dashboards, tables,
 * exports and the risk engine all read from here so no two screens can
 * disagree about a team's numbers.
 */
export async function computeTeamMetrics(where: Prisma.TeamWhereInput): Promise<TeamMetrics[]> {
  const teams = await db.team.findMany({
    where,
    include: {
      department: { select: { id: true, code: true } },
      section: { select: { id: true, name: true } },
      semester: { select: { number: true } },
      projectType: { select: { code: true } },
      mentor: { select: { id: true, name: true } },
      members: { where: { removedAt: null }, select: { id: true } },
      meetings: {
        select: { id: true, status: true, heldAt: true, presentCount: true, memberCount: true },
      },
      resources: {
        where: { isArchived: false },
        select: { category: { select: { code: true } } },
      },
      presentationSlots: {
        select: {
          submissions: {
            where: { status: "SUBMITTED" },
            select: { totalMarks: true, maxMarks: true },
          },
        },
      },
      academicYear: { select: { id: true } },
    },
  });

  if (!teams.length) return [];

  const [weights, riskRules] = await Promise.all([
    getSetting("analytics.healthWeights"),
    getSetting("analytics.riskRules"),
  ]);

  const configs = await db.academicConfiguration.findMany({
    select: { academicYearId: true, semesterId: true, expectedMeetings: true },
  });
  const expectedByKey = new Map(
    configs.map((c) => [`${c.academicYearId}:${c.semesterId}`, c.expectedMeetings]),
  );

  const now = Date.now();

  return teams.map((team) => {
    const approved = team.meetings.filter((m) => m.status === "APPROVED");
    const rejected = team.meetings.filter((m) => m.status === "REJECTED" || m.status === "RESUBMISSION_REQUIRED");
    const counted = approved.length ? approved : team.meetings.filter((m) => m.status !== "REJECTED");

    const lastMeetingAt = counted.reduce<Date | null>(
      (acc, m) => (!acc || m.heldAt > acc ? m.heldAt : acc),
      null,
    );
    const daysSinceLastMeeting = lastMeetingAt
      ? Math.floor((now - lastMeetingAt.getTime()) / 86_400_000)
      : null;

    const expectedMeetings =
      expectedByKey.get(`${team.academicYearId}:${team.semesterId}`) ?? 12;

    const attendanceSlots = counted.reduce((sum, m) => sum + m.memberCount, 0);
    const attendancePresent = counted.reduce((sum, m) => sum + m.presentCount, 0);
    const attendancePct = attendanceSlots > 0 ? (attendancePresent / attendanceSlots) * 100 : null;

    const submissions = team.presentationSlots.flatMap((s) => s.submissions);
    const presentationPct = submissions.length
      ? (submissions.reduce((sum, s) => sum + (s.maxMarks > 0 ? s.totalMarks / s.maxMarks : 0), 0) /
          submissions.length) *
        100
      : null;

    const presentCategories = new Set(team.resources.map((r) => r.category.code));
    const resourceCompletenessPct =
      (REQUIRED_RESOURCE_CODES.filter((c) => presentCategories.has(c)).length /
        REQUIRED_RESOURCE_CODES.length) *
      100;

    const meetingActivityPct = Math.min(100, (counted.length / Math.max(1, expectedMeetings)) * 100);
    const progressPct = progressScore(counted.length, expectedMeetings, daysSinceLastMeeting, riskRules);

    const healthScore = weightedScore(weights, {
      meetingActivity: meetingActivityPct,
      attendance: attendancePct ?? 0,
      presentation: presentationPct ?? meetingActivityPct, // no presentation yet → neutral on activity
      progress: progressPct,
      repository: resourceCompletenessPct,
    });

    const risks = evaluateRisks(
      { daysSinceLastMeeting, attendancePct, presentationPct, rejected: rejected.length, resourceCompletenessPct, meetingsHeld: counted.length },
      riskRules,
    );

    return {
      teamId: team.id,
      code: team.teamId,
      projectTitle: team.projectTitle,
      departmentId: team.department.id,
      departmentCode: team.department.code,
      sectionId: team.section?.id ?? null,
      sectionName: team.section?.name ?? null,
      semesterNumber: team.semester.number,
      projectTypeCode: team.projectType.code,
      mentorUserId: team.mentor?.id ?? null,
      mentorName: team.mentor?.name ?? null,
      memberCount: team.members.length,
      meetingsHeld: counted.length,
      meetingsApproved: approved.length,
      meetingsRejected: rejected.length,
      expectedMeetings,
      lastMeetingAt,
      daysSinceLastMeeting,
      attendancePct,
      presentationPct,
      resourceCompletenessPct,
      healthScore,
      healthLabel: healthBand(healthScore).label,
      risks,
      atRisk: risks.length > 0,
    };
  });
}

function weightedScore(weights: HealthWeights, parts: HealthWeights): number {
  const total =
    weights.meetingActivity + weights.attendance + weights.presentation + weights.progress + weights.repository;
  if (total <= 0) return 0;
  const raw =
    parts.meetingActivity * weights.meetingActivity +
    parts.attendance * weights.attendance +
    parts.presentation * weights.presentation +
    parts.progress * weights.progress +
    parts.repository * weights.repository;
  return Math.round(Math.max(0, Math.min(100, raw / total)));
}

function progressScore(
  held: number,
  expected: number,
  daysSince: number | null,
  rules: RiskRules,
): number {
  const cadence = Math.min(100, (held / Math.max(1, expected)) * 100);
  if (daysSince === null) return held > 0 ? cadence : 0;
  const staleness = Math.max(0, 100 - (daysSince / rules.maxDaysWithoutMeeting) * 100);
  return Math.round(cadence * 0.6 + staleness * 0.4);
}

function evaluateRisks(
  input: {
    daysSinceLastMeeting: number | null;
    attendancePct: number | null;
    presentationPct: number | null;
    rejected: number;
    resourceCompletenessPct: number;
    meetingsHeld: number;
  },
  rules: RiskRules,
): string[] {
  const risks: string[] = [];
  if (input.meetingsHeld === 0) {
    risks.push("No meeting recorded yet");
  } else if (input.daysSinceLastMeeting !== null && input.daysSinceLastMeeting > rules.maxDaysWithoutMeeting) {
    risks.push(`No meeting for ${input.daysSinceLastMeeting} days`);
  }
  if (input.attendancePct !== null && input.attendancePct < rules.minAttendancePct) {
    risks.push(`Attendance: ${input.attendancePct.toFixed(0)}%`);
  }
  if (input.rejected > rules.maxRejectedMeetings) {
    risks.push(`${input.rejected} rejected evidence submissions`);
  }
  if (input.presentationPct !== null && input.presentationPct < rules.minPresentationPct) {
    risks.push(`Presentation score: ${input.presentationPct.toFixed(0)}%`);
  }
  if (rules.requireRepositoryLinks && input.resourceCompletenessPct < 50) {
    risks.push("Missing project repository links");
  }
  return risks;
}

// --- Rollups ---------------------------------------------------------------

export interface Rollup {
  key: string;
  label: string;
  teams: number;
  students: number;
  meetings: number;
  attendancePct: number | null;
  presentationPct: number | null;
  healthScore: number;
  atRisk: number;
}

export function rollup(
  metrics: TeamMetrics[],
  keyOf: (m: TeamMetrics) => { key: string; label: string } | null,
): Rollup[] {
  const buckets = new Map<string, { label: string; items: TeamMetrics[] }>();
  for (const m of metrics) {
    const k = keyOf(m);
    if (!k) continue;
    const bucket = buckets.get(k.key) ?? { label: k.label, items: [] };
    bucket.items.push(m);
    buckets.set(k.key, bucket);
  }
  return [...buckets.entries()]
    .map(([key, { label, items }]) => ({ key, label, ...summarise(items) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function summarise(items: TeamMetrics[]): Omit<Rollup, "key" | "label"> {
  const withAttendance = items.filter((i) => i.attendancePct !== null);
  const withPresentation = items.filter((i) => i.presentationPct !== null);
  return {
    teams: items.length,
    students: items.reduce((s, i) => s + i.memberCount, 0),
    meetings: items.reduce((s, i) => s + i.meetingsHeld, 0),
    attendancePct: withAttendance.length
      ? withAttendance.reduce((s, i) => s + (i.attendancePct ?? 0), 0) / withAttendance.length
      : null,
    presentationPct: withPresentation.length
      ? withPresentation.reduce((s, i) => s + (i.presentationPct ?? 0), 0) / withPresentation.length
      : null,
    healthScore: items.length ? Math.round(items.reduce((s, i) => s + i.healthScore, 0) / items.length) : 0,
    atRisk: items.filter((i) => i.atRisk).length,
  };
}

// --- Student-level attendance ---------------------------------------------

export interface StudentAttendance {
  studentId: string;
  name: string;
  enrollmentNo: string;
  teamCode: string | null;
  total: number;
  present: number;
  pct: number | null;
}

export async function studentAttendance(teamIds: string[]): Promise<StudentAttendance[]> {
  if (!teamIds.length) return [];
  const rows = await db.meetingAttendance.findMany({
    where: { meeting: { teamId: { in: teamIds }, status: { not: "REJECTED" } } },
    select: {
      studentId: true,
      present: true,
      nameSnapshot: true,
      enrollSnapshot: true,
      meeting: { select: { team: { select: { teamId: true } } } },
    },
  });

  const map = new Map<string, StudentAttendance>();
  for (const row of rows) {
    const entry =
      map.get(row.studentId) ??
      {
        studentId: row.studentId,
        name: row.nameSnapshot,
        enrollmentNo: row.enrollSnapshot,
        teamCode: row.meeting.team.teamId,
        total: 0,
        present: 0,
        pct: null,
      };
    entry.total += 1;
    if (row.present) entry.present += 1;
    map.set(row.studentId, entry);
  }
  return [...map.values()]
    .map((e) => ({ ...e, pct: e.total ? (e.present / e.total) * 100 : null }))
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
}

/** Meetings per ISO week, for trend charts. */
export async function meetingTrend(where: Prisma.TeamWhereInput, weeks = 12) {
  const since = new Date(Date.now() - weeks * 7 * 86_400_000);
  const meetings = await db.meeting.findMany({
    where: { team: where, heldAt: { gte: since }, status: { not: "REJECTED" } },
    select: { heldAt: true, presentCount: true, memberCount: true },
    orderBy: { heldAt: "asc" },
  });

  const buckets = new Map<string, { meetings: number; present: number; slots: number }>();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 7 * 86_400_000);
    buckets.set(weekKey(d), { meetings: 0, present: 0, slots: 0 });
  }
  for (const m of meetings) {
    const key = weekKey(m.heldAt);
    const b = buckets.get(key);
    if (!b) continue;
    b.meetings += 1;
    b.present += m.presentCount;
    b.slots += m.memberCount;
  }
  return [...buckets.entries()].map(([label, b]) => ({
    label,
    meetings: b.meetings,
    attendancePct: b.slots ? Math.round((b.present / b.slots) * 100) : 0,
  }));
}

function weekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `W${String(week).padStart(2, "0")}`;
}
