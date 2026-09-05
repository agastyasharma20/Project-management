import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrincipal } from "@/lib/auth/session";
import { can } from "@/lib/auth/rbac";
import { teamScopeWhere } from "@/lib/services/teams";
import {
  computeTeamMetrics,
  filtersToWhere,
  rollup,
  studentAttendance,
} from "@/lib/services/analytics";
import { presentationResults } from "@/lib/services/evaluation";
import { fileNameFor, toCsv, toXlsx, type ReportTable } from "@/lib/services/reports";
import { formatDate } from "@/lib/utils";

const KINDS = ["teams", "attendance", "meetings", "presentations", "faculty"] as const;
type Kind = (typeof KINDS)[number];

/**
 * Report generation. The caller's scope is applied to the underlying query, so
 * an HOD exporting "college" data still receives only their department.
 */
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const principal = await getPrincipal();
  if (!principal) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(principal, "report.generate")) return new NextResponse("Forbidden", { status: 403 });

  const { kind: rawKind } = await context.params;
  if (!KINDS.includes(rawKind as Kind)) return new NextResponse("Unknown report", { status: 404 });
  const kind = rawKind as Kind;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const scope = url.searchParams.get("scope");

  const filters = {
    academicYearId: url.searchParams.get("year") ?? undefined,
    departmentId: url.searchParams.get("department") ?? undefined,
    semesterId: url.searchParams.get("semester") ?? undefined,
    sectionId: url.searchParams.get("section") ?? undefined,
    projectTypeId: url.searchParams.get("type") ?? undefined,
    mentorUserId: url.searchParams.get("mentor") ?? undefined,
  };
  const where = filtersToWhere(filters, teamScopeWhere(principal));

  const tables: ReportTable[] = [];

  if (kind === "teams") {
    const metrics = await computeTeamMetrics(where);
    tables.push({
      name: "Projects",
      columns: [
        { key: "code", header: "Team ID" },
        { key: "title", header: "Project" },
        { key: "department", header: "Department" },
        { key: "section", header: "Section" },
        { key: "semester", header: "Semester" },
        { key: "type", header: "Type" },
        { key: "mentor", header: "Mentor" },
        { key: "members", header: "Members" },
        { key: "meetings", header: "Meetings held" },
        { key: "expected", header: "Meetings expected" },
        { key: "lastMeeting", header: "Last meeting" },
        { key: "attendance", header: "Attendance %" },
        { key: "presentation", header: "Presentation %" },
        { key: "resources", header: "Resource completeness %" },
        { key: "health", header: "Health score" },
        { key: "band", header: "Health band" },
        { key: "risks", header: "Risk flags" },
      ],
      rows: metrics.map((m) => ({
        code: m.code,
        title: m.projectTitle,
        department: m.departmentCode,
        section: m.sectionName,
        semester: m.semesterNumber,
        type: m.projectTypeCode,
        mentor: m.mentorName,
        members: m.memberCount,
        meetings: m.meetingsHeld,
        expected: m.expectedMeetings,
        lastMeeting: m.lastMeetingAt ? formatDate(m.lastMeetingAt) : "",
        attendance: m.attendancePct === null ? "" : Number(m.attendancePct.toFixed(1)),
        presentation: m.presentationPct === null ? "" : Number(m.presentationPct.toFixed(1)),
        resources: Number(m.resourceCompletenessPct.toFixed(0)),
        health: m.healthScore,
        band: m.healthLabel,
        risks: m.risks.join("; "),
      })),
    });
  }

  if (kind === "attendance") {
    const teams = await db.team.findMany({ where, select: { id: true } });
    if (scope === "students") {
      const rows = await studentAttendance(teams.map((t) => t.id));
      tables.push({
        name: "Student attendance",
        columns: [
          { key: "name", header: "Student" },
          { key: "enrollmentNo", header: "Enrollment" },
          { key: "teamCode", header: "Team" },
          { key: "present", header: "Present" },
          { key: "total", header: "Meetings" },
          { key: "pct", header: "Attendance %" },
        ],
        rows: rows.map((r) => ({
          name: r.name,
          enrollmentNo: r.enrollmentNo,
          teamCode: r.teamCode,
          present: r.present,
          total: r.total,
          pct: r.pct === null ? "" : Number(r.pct.toFixed(1)),
        })),
      });
    } else {
      const metrics = await computeTeamMetrics(where);
      const groups = [
        { name: "By department", rows: rollup(metrics, (m) => ({ key: m.departmentId, label: m.departmentCode })) },
        {
          name: "By section",
          rows: rollup(metrics, (m) =>
            m.sectionId ? { key: m.sectionId, label: `${m.departmentCode}-${m.sectionName}` } : null,
          ),
        },
        {
          name: "By semester",
          rows: rollup(metrics, (m) => ({ key: String(m.semesterNumber), label: `Semester ${m.semesterNumber}` })),
        },
      ];
      for (const group of groups) {
        tables.push({
          name: group.name,
          columns: [
            { key: "label", header: "Group" },
            { key: "teams", header: "Teams" },
            { key: "students", header: "Students" },
            { key: "meetings", header: "Meetings" },
            { key: "attendance", header: "Attendance %" },
            { key: "health", header: "Health" },
            { key: "atRisk", header: "At risk" },
          ],
          rows: group.rows.map((r) => ({
            label: r.label,
            teams: r.teams,
            students: r.students,
            meetings: r.meetings,
            attendance: r.attendancePct === null ? "" : Number(r.attendancePct.toFixed(1)),
            health: r.healthScore,
            atRisk: r.atRisk,
          })),
        });
      }
    }
  }

  if (kind === "meetings") {
    const meetings = await db.meeting.findMany({
      where: { team: where },
      include: {
        team: { select: { teamId: true, department: { select: { code: true } } } },
        mentor: { select: { name: true } },
        evidence: true,
      },
      orderBy: { heldAt: "desc" },
      take: 5000,
    });
    tables.push({
      name: "Meetings",
      columns: [
        { key: "code", header: "Meeting" },
        { key: "team", header: "Team" },
        { key: "department", header: "Department" },
        { key: "mentor", header: "Mentor" },
        { key: "heldAt", header: "Held on" },
        { key: "present", header: "Present" },
        { key: "members", header: "Members" },
        { key: "status", header: "Status" },
        { key: "lat", header: "Latitude" },
        { key: "lng", header: "Longitude" },
        { key: "accuracy", header: "Accuracy (m)" },
        { key: "distance", header: "Distance from campus (m)" },
        { key: "geofence", header: "Inside geofence" },
        { key: "discussion", header: "Discussion" },
      ],
      rows: meetings.map((m) => ({
        code: m.code,
        team: m.team.teamId,
        department: m.team.department.code,
        mentor: m.mentor.name,
        heldAt: formatDate(m.heldAt),
        present: m.presentCount,
        members: m.memberCount,
        status: m.status,
        lat: m.evidence?.latitude ?? "",
        lng: m.evidence?.longitude ?? "",
        accuracy: m.evidence ? Math.round(m.evidence.accuracyM) : "",
        distance: m.evidence ? Math.round(m.evidence.distanceM) : "",
        geofence: m.evidence ? (m.evidence.geofenceOk ? "yes" : "no") : "",
        discussion: m.discussion,
      })),
    });
  }

  if (kind === "presentations") {
    if (!can(principal, "marks.read.all")) return new NextResponse("Forbidden", { status: 403 });
    const presentations = await db.presentation.findMany({
      where: filters.departmentId ? { departmentId: filters.departmentId } : {},
      orderBy: { scheduledOn: "desc" },
      take: 50,
    });
    for (const presentation of presentations) {
      const results = await presentationResults(presentation.id);
      if (!results.length) continue;
      tables.push({
        name: presentation.name.slice(0, 28),
        columns: [
          { key: "team", header: "Team" },
          { key: "project", header: "Project" },
          { key: "judges", header: "Judges" },
          { key: "average", header: "Average" },
          { key: "highest", header: "Highest" },
          { key: "lowest", header: "Lowest" },
          { key: "median", header: "Median" },
          { key: "max", header: "Out of" },
          { key: "perJudge", header: "Per judge" },
        ],
        rows: results.map((r) => ({
          team: r.teamCode,
          project: r.projectTitle,
          judges: r.judgeCount,
          average: r.average === null ? "" : Number(r.average.toFixed(2)),
          highest: r.highest,
          lowest: r.lowest,
          median: r.median,
          max: r.maxMarks,
          perJudge: r.perJudge.map((j) => `${j.judge}: ${j.total}`).join("; "),
        })),
      });
    }
  }

  if (kind === "faculty") {
    const metrics = await computeTeamMetrics(where);
    const byMentor = rollup(metrics, (m) =>
      m.mentorUserId ? { key: m.mentorUserId, label: m.mentorName ?? "Unassigned" } : null,
    );
    tables.push({
      name: "Faculty activity",
      columns: [
        { key: "label", header: "Mentor" },
        { key: "teams", header: "Teams" },
        { key: "students", header: "Students" },
        { key: "meetings", header: "Meetings recorded" },
        { key: "attendance", header: "Mentee attendance %" },
        { key: "presentation", header: "Presentation %" },
        { key: "health", header: "Average health" },
        { key: "atRisk", header: "At-risk teams" },
      ],
      rows: byMentor.map((r) => ({
        label: r.label,
        teams: r.teams,
        students: r.students,
        meetings: r.meetings,
        attendance: r.attendancePct === null ? "" : Number(r.attendancePct.toFixed(1)),
        presentation: r.presentationPct === null ? "" : Number(r.presentationPct.toFixed(1)),
        health: r.healthScore,
        atRisk: r.atRisk,
      })),
    });
  }

  if (!tables.length) {
    tables.push({ name: "Empty", columns: [{ key: "note", header: "Note" }], rows: [{ note: "No records in scope." }] });
  }

  if (format === "xlsx") {
    const buffer = await toXlsx(tables);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileNameFor(`piemr-${kind}`, "xlsx")}"`,
      },
    });
  }

  const csv = tables.map((t) => `# ${t.name}\r\n${toCsv(t)}`).join("\r\n\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileNameFor(`piemr-${kind}`, "csv")}"`,
    },
  });
}
