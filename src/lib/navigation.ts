import type { Permission, Principal } from "@/lib/auth/rbac";
import { canAny } from "@/lib/auth/rbac";

export interface NavItem {
  label: string;
  href: string;
  /** Item is shown when the principal holds ANY of these permissions. */
  requires: Permission[];
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", requires: ["notification.read"], exact: true },
    ],
  },
  {
    label: "Projects",
    items: [
      { label: "All Projects", href: "/teams", requires: ["team.read.all", "team.read.department", "team.read.mentored"] },
      { label: "Registrations", href: "/registrations", requires: ["team.approve"] },
      { label: "My Team", href: "/my-team", requires: ["team.read.own"] },
    ],
  },
  {
    label: "Meetings",
    items: [
      { label: "Record Meeting", href: "/meetings/record", requires: ["meeting.record"] },
      { label: "All Meetings", href: "/meetings", requires: ["meeting.read.all", "meeting.read.department", "meeting.read.mentored", "meeting.read.own"] },
      { label: "Pending Approval", href: "/meetings?status=PENDING_APPROVAL", requires: ["meeting.approve"] },
    ],
  },
  {
    label: "Attendance",
    items: [
      { label: "Overview", href: "/attendance", requires: ["analytics.read.college", "analytics.read.department", "analytics.read.mentored"] },
      { label: "Students", href: "/attendance/students", requires: ["analytics.read.college", "analytics.read.department", "analytics.read.mentored"] },
    ],
  },
  {
    label: "Presentations",
    items: [
      { label: "Schedule", href: "/presentations", requires: ["presentation.read"] },
      { label: "Marking Schemes", href: "/schemes", requires: ["scheme.write"] },
      { label: "Judges", href: "/judges", requires: ["judge.manage"] },
      { label: "Evaluate", href: "/judge", requires: ["marks.enter"] },
      { label: "Results", href: "/presentations/results", requires: ["marks.read.all"] },
      // No student/faculty-facing marks link: presentation marks are visible
      // only to HOD/Admin/Director/Super Admin.
    ],
  },
  {
    label: "People",
    items: [{ label: "Users", href: "/users", requires: ["user.read"] }],
  },
  {
    label: "Insight",
    items: [
      { label: "Analytics", href: "/analytics", requires: ["analytics.read.college", "analytics.read.department", "analytics.read.mentored"] },
      { label: "Reports", href: "/reports", requires: ["report.generate"] },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Configuration", href: "/configuration", requires: ["config.write"] },
      // Audit review is intentionally not granted to SUPER_ADMIN (see rbac.ts).
      { label: "Audit Logs", href: "/audit", requires: ["audit.read"] },
    ],
  },
];

export function navigationFor(principal: Principal): NavGroup[] {
  return GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => canAny(principal, item.requires)),
  })).filter((group) => group.items.length > 0);
}
