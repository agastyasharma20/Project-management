"use client";

import { useState } from "react";
import { buttonClass, Card, CardBody, CardHeader, Field, Select } from "@/components/ui";

interface Option {
  value: string;
  label: string;
}

const REPORTS = [
  { kind: "teams", label: "Team / project report", description: "Projects with meetings, attendance, health and risk flags." },
  { kind: "attendance", label: "Attendance report", description: "Rolled up by department, section and semester." },
  { kind: "meetings", label: "Meeting evidence report", description: "Every meeting with its GPS and geofence record." },
  { kind: "faculty", label: "Faculty activity report", description: "Mentee counts, meeting activity and attendance." },
  { kind: "presentations", label: "Presentation report", description: "Judge-wise and aggregate marks per event.", needsMarks: true },
] as const;

export function ReportBuilder({
  canSeeMarks,
  options,
}: {
  canSeeMarks: boolean;
  options: { years: Option[]; departments: Option[]; semesters: Option[]; types: Option[]; mentors: Option[] };
}) {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const query = () => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    return params.toString();
  };

  const set = (key: string, value: string) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <Card>
      <CardHeader title="Build an export" description="Choose the scope, then pick a format." />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Academic year" htmlFor="year">
            <Select id="year" value={filters.year ?? ""} onChange={(e) => set("year", e.target.value)}>
              <option value="">All</option>
              {options.years.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department" htmlFor="department">
            <Select id="department" value={filters.department ?? ""} onChange={(e) => set("department", e.target.value)}>
              <option value="">All</option>
              {options.departments.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Semester" htmlFor="semester">
            <Select id="semester" value={filters.semester ?? ""} onChange={(e) => set("semester", e.target.value)}>
              <option value="">All</option>
              {options.semesters.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project type" htmlFor="type">
            <Select id="type" value={filters.type ?? ""} onChange={(e) => set("type", e.target.value)}>
              <option value="">All</option>
              {options.types.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mentor" htmlFor="mentor">
            <Select id="mentor" value={filters.mentor ?? ""} onChange={(e) => set("mentor", e.target.value)}>
              <option value="">All</option>
              {options.mentors.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <ul className="divide-y divide-[var(--color-line)]">
          {REPORTS.filter((r) => !("needsMarks" in r && r.needsMarks) || canSeeMarks).map((report) => (
            <li key={report.kind} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{report.label}</p>
                <p className="text-[12px] text-[var(--color-muted)]">{report.description}</p>
              </div>
              <div className="flex gap-2">
                <a className={buttonClass("secondary", "sm")} href={`/api/reports/${report.kind}?format=csv&${query()}`}>
                  CSV
                </a>
                <a className={buttonClass("secondary", "sm")} href={`/api/reports/${report.kind}?format=xlsx&${query()}`}>
                  Excel
                </a>
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
