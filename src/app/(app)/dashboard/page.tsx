import { requirePrincipal } from "@/lib/auth/session";
import { canAny } from "@/lib/auth/rbac";
import { AdminDashboard } from "./admin-dashboard";
import { FacultyDashboard } from "./faculty-dashboard";
import { StudentDashboard } from "./student-dashboard";
import { JudgeDashboard } from "./judge-dashboard";

export const metadata = { title: "Dashboard" };

/**
 * One route, role-appropriate content. Super Admin / Director / Admin / HOD
 * share the analytical dashboard (scoped by their reach); mentors, students and
 * judges get their own task-focused surfaces.
 */
export default async function DashboardPage() {
  const principal = await requirePrincipal();

  if (canAny(principal, ["analytics.read.college", "analytics.read.department"])) {
    return <AdminDashboard principal={principal} />;
  }
  if (principal.roles.includes("FACULTY_MENTOR")) return <FacultyDashboard principal={principal} />;
  if (principal.roles.includes("STUDENT")) return <StudentDashboard principal={principal} />;
  return <JudgeDashboard principal={principal} />;
}
