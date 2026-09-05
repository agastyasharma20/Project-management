"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Button, Select } from "@/components/ui";

export type FilterField = "q" | "year" | "department" | "semester" | "section" | "type" | "status" | "mentor" | "risk";

const LABELS: Record<FilterField, string> = {
  q: "Search",
  year: "Academic year",
  department: "Department",
  semester: "Semester",
  section: "Section",
  type: "Project type",
  status: "Status",
  mentor: "Mentor",
  risk: "Risk",
};

export interface Option {
  value: string;
  label: string;
}

/**
 * Server-driven filtering: every change writes to the URL so the page re-runs
 * its query on the server. Nothing is filtered in the browser, which keeps
 * large tables paginated and scoped.
 */
export function FilterBar({
  basePath,
  current,
  fields,
  options,
}: {
  basePath: string;
  current: Record<string, string | string[] | undefined>;
  fields: FilterField[];
  options: Partial<Record<FilterField, Option[]>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const read = (key: string) => {
    const raw = current[key];
    return (Array.isArray(raw) ? raw[0] : raw) ?? "";
  };
  const [search, setSearch] = useState(read("q"));

  const apply = (key: string, value: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) {
      const val = Array.isArray(v) ? v[0] : v;
      if (val && k !== "page") params.set(k, val);
    }
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${basePath || pathname}?${params.toString()}`);
  };

  const hasFilters = Object.entries(current).some(([k, v]) => v && k !== "page");

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        apply("q", search);
      }}
    >
      {fields.includes("q") ? (
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="filter-q" className="mb-1 block text-[12px] font-medium text-[var(--color-muted)]">
            {LABELS.q}
          </label>
          <input
            id="filter-q"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Team ID, title, enrollment…"
            className="h-9 w-full rounded-lg border border-[var(--color-line-strong)] bg-white px-3 text-[13px]"
          />
        </div>
      ) : null}

      {fields
        .filter((f) => f !== "q")
        .map((field) => (
          <div key={field} className="min-w-[9rem]">
            <label htmlFor={`filter-${field}`} className="mb-1 block text-[12px] font-medium text-[var(--color-muted)]">
              {LABELS[field]}
            </label>
            <Select
              id={`filter-${field}`}
              value={read(field)}
              onChange={(e) => apply(field, e.target.value)}
              className="h-9 text-[13px]"
            >
              <option value="">All</option>
              {(options[field] ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        ))}

      <Button type="submit" size="sm" variant="secondary" className="h-9">
        Apply
      </Button>
      {hasFilters ? (
        <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => router.push(basePath)}>
          Clear
        </Button>
      ) : null}
    </form>
  );
}
