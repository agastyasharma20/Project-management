import Link from "next/link";
import { getPrincipal } from "@/lib/auth/session";
import { AnimatedBackground } from "@/components/animated-background";
import { SiteFooter } from "@/components/site-footer";
import { buttonClass } from "@/components/ui";

export const metadata = {
  title: "PIEMR Project Platform",
  description:
    "The project lifecycle, evidence, attendance, presentation and analytics platform for Prestige Institute of Engineering Management & Research, Indore.",
};

const FEATURES = [
  {
    title: "Registration & Approval",
    body:
      "Team leads register a project once. A mentor or HOD approval issues a permanent Team ID — no more spreadsheet rows drifting out of sync.",
  },
  {
    title: "Verified Meeting Evidence",
    body:
      "Mentors record official meetings on their phone: live GPS checked against the campus geofence, a camera capture, attendance ticked from the real roster — server-stamped and tamper-evident.",
  },
  {
    title: "Attendance Intelligence",
    body:
      "Every meeting rolls up automatically to student, team, section, semester, department and college-level attendance — no manual tallying, ever.",
  },
  {
    title: "Presentations & Evaluation",
    body:
      "Configurable presentation events, dynamic marking schemes, and multiple judges per team — every judge's original submission preserved, aggregated transparently.",
  },
  {
    title: "Project Health & Risk",
    body:
      "A transparent, configurable health score and rules-based risk engine surface the teams that need attention — before they fall behind.",
  },
  {
    title: "Role-Based, Department-Scoped",
    body:
      "Super Admin down to Student, every screen and every action is scoped to what that person is actually meant to see — enforced on the server, not just hidden in the UI.",
  },
];

const ROLES = [
  { role: "Super Admin / Director / Admin", scope: "College-wide configuration, users, analytics and reports." },
  { role: "HOD", scope: "Full control of their own department — teams, faculty, students, presentations." },
  { role: "Faculty Mentor", scope: "Their mentee teams: meeting evidence, attendance, project progress." },
  { role: "Judge", scope: "Enter a Team ID, evaluate against the configured scheme — nothing else." },
  { role: "Student", scope: "Their own team, its attendance, meeting history and project resources." },
];

export default async function Home() {
  const principal = await getPrincipal();

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-canvas)]">
      <header className="relative border-b border-[var(--color-line)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-brand-600)] text-sm font-bold text-white">
              P
            </span>
            <span className="text-[15px] font-semibold">PIEMR Project Platform</span>
          </Link>
          <nav className="flex items-center gap-2">
            {principal ? (
              <Link href="/dashboard" className={buttonClass("primary", "sm")}>
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonClass("secondary", "sm")}>
                  Sign in
                </Link>
                <Link href="/register" className={buttonClass("primary", "sm")}>
                  Register your team
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <AnimatedBackground />
          <div className="relative mx-auto max-w-4xl px-5 py-20 text-center sm:py-28">
            <span className="inline-flex items-center rounded-full border border-[var(--color-line-strong)] bg-white/70 px-3 py-1 text-[12px] font-medium text-[var(--color-muted)] backdrop-blur">
              Prestige Institute of Engineering Management &amp; Research, Indore
            </span>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              One platform for every Minor and Major project,
              <br className="hidden sm:block" /> from registration to final presentation.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[15px] text-[var(--color-muted)] sm:text-base">
              This replaces the Excel-based process the college used to track project teams. It answers, in
              seconds: what projects are running, who is mentoring them, whether teams are actually meeting,
              where and when the evidence was captured, and which teams need attention — for every department,
              not only one.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {principal ? (
                <Link href="/dashboard" className={buttonClass("primary", "md")}>
                  Go to my dashboard
                </Link>
              ) : (
                <>
                  <Link href="/register" className={buttonClass("primary", "md")}>
                    Register your team
                  </Link>
                  <Link href="/login" className={buttonClass("secondary", "md")}>
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        {/* What is this */}
        <section className="border-t border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="mx-auto max-w-4xl px-5 py-14 text-center">
            <h2 className="text-xl font-semibold sm:text-2xl">What this is</h2>
            <p className="mx-auto mt-3 max-w-2xl text-[14px] text-[var(--color-muted)]">
              A centralised academic project lifecycle and project-intelligence platform — not a spreadsheet
              moved online. Every team, meeting, attendance record, presentation and evaluation lives in one
              place with a complete, auditable history from the day a project is registered to the day it is
              presented.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-5">
                <h3 className="text-[14px] font-semibold">{f.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Roles */}
        <section className="border-t border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="mx-auto max-w-5xl px-5 py-14">
            <h2 className="text-center text-xl font-semibold sm:text-2xl">Built for every role in the department</h2>
            <div className="mt-8 divide-y divide-[var(--color-line)] overflow-hidden rounded-xl border border-[var(--color-line)]">
              {ROLES.map((r) => (
                <div key={r.role} className="flex flex-col gap-1 bg-white px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                  <span className="shrink-0 text-[13px] font-semibold sm:w-64">{r.role}</span>
                  <span className="text-[13px] text-[var(--color-muted)]">{r.scope}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        {!principal ? (
          <section className="mx-auto max-w-3xl px-5 py-16 text-center">
            <h2 className="text-xl font-semibold sm:text-2xl">Ready to get started?</h2>
            <p className="mt-2 text-[14px] text-[var(--color-muted)]">
              Team leads register directly; everyone else signs in with the credentials issued by their
              department office.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className={buttonClass("primary", "md")}>
                Register your team
              </Link>
              <Link href="/login" className={buttonClass("secondary", "md")}>
                Sign in
              </Link>
            </div>
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}
