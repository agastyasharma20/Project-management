import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";
import { can, isCollegeWide } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { getGeofence, getSetting } from "@/lib/services/settings";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { AcademicConfigForms } from "./academic-forms";
import { AnalyticsConfigForm } from "./analytics-form";
import { GeofenceForm } from "./geofence-form";
import { MeetingRulesForm } from "./meeting-rules-form";

export const metadata = { title: "Configuration" };

export default async function ConfigurationPage() {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["config.write"]);
  if (denied) return denied;

  const departmentScope = isCollegeWide(principal) ? undefined : principal.departmentIds[0];

  const [geofence, weights, risks, meetingRules, departments, sections, years, semesters, types, configs] =
    await Promise.all([
      getGeofence(departmentScope),
      getSetting("analytics.healthWeights"),
      getSetting("analytics.riskRules"),
      getSetting("meetings.rules", departmentScope),
      db.department.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      db.section.findMany({ include: { department: { select: { code: true } } }, orderBy: { name: "asc" } }),
      db.academicYear.findMany({ orderBy: { label: "desc" } }),
      db.semester.findMany({ orderBy: { number: "asc" } }),
      db.projectType.findMany({ orderBy: { code: "asc" } }),
      db.academicConfiguration.findMany({
        include: {
          academicYear: { select: { label: true } },
          semester: { select: { number: true } },
          projectType: { select: { name: true } },
        },
        orderBy: [{ academicYear: { label: "desc" } }, { semester: { number: "asc" } }],
      }),
    ]);

  return (
    <>
      <PageHeader
        title="Configuration"
        description="Academic structure, meeting rules, geofencing and analytics thresholds — no rule is hardcoded."
      />

      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Academic structure
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Departments" description={`${departments.length} active`} />
              <Table>
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Name</Th>
                    <Th>Sections</Th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.id}>
                      <Td className="font-medium">{d.code}</Td>
                      <Td>{d.name}</Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          {sections
                            .filter((s) => s.departmentId === d.id)
                            .map((s) => (
                              <Badge key={s.id}>{s.name}</Badge>
                            ))}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <Card>
              <CardHeader title="Semester → project type" description="Replaces hardcoded semester logic." />
              <Table>
                <thead>
                  <tr>
                    <Th>Academic year</Th>
                    <Th>Semester</Th>
                    <Th>Project type</Th>
                    <Th>Expected meetings</Th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c) => (
                    <tr key={c.id}>
                      <Td>{c.academicYear.label}</Td>
                      <Td>Semester {c.semester.number}</Td>
                      <Td>
                        <Badge tone="brand">{c.projectType.name}</Badge>
                      </Td>
                      <Td className="tabular">{c.expectedMeetings}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>

          <div className="mt-4">
            <AcademicConfigForms
              collegeWide={isCollegeWide(principal)}
              departments={departments.map((d) => ({ value: d.id, label: d.code }))}
              years={years.map((y) => ({ value: y.id, label: y.label }))}
              semesters={semesters.map((s) => ({ value: s.id, label: `Semester ${s.number}` }))}
              types={types.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Meetings, evidence and geofence
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <GeofenceForm
              current={{
                name: geofence.name,
                latitude: geofence.latitude,
                longitude: geofence.longitude,
                radiusM: geofence.radiusM,
                minAccuracyM: geofence.minAccuracyM,
                goodAccuracyM: geofence.goodAccuracyM,
                warnAccuracyM: geofence.warnAccuracyM,
                enforce: geofence.enforce,
              }}
              collegeWide={isCollegeWide(principal)}
              departments={departments.map((d) => ({ value: d.id, label: d.code }))}
            />
            <MeetingRulesForm
              current={meetingRules}
              collegeWide={isCollegeWide(principal)}
              departments={departments.map((d) => ({ value: d.id, label: d.code }))}
            />
          </div>
        </section>

        {can(principal, "analytics.config.write") ? (
          <section>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Analytics
            </h2>
            <AnalyticsConfigForm weights={weights} risks={risks} />
          </section>
        ) : null}
      </div>
    </>
  );
}
