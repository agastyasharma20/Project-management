import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { AnimatedBackground } from "@/components/animated-background";
import { SiteFooter } from "@/components/site-footer";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getPrincipal()) redirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
        <section className="hidden flex-col justify-between bg-[var(--color-brand-700)] px-10 py-12 text-white lg:flex">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-lg font-bold">P</span>
            <span className="text-[15px] font-semibold">PIEMR</span>
          </Link>
          <div className="max-w-md">
            <h1 className="text-3xl font-semibold leading-tight">
              Project Intelligence &amp; Management Platform
            </h1>
            <p className="mt-3 text-[15px] text-white/80">
              Minor and Major project registration, verified meeting evidence, attendance, presentations
              and institution-wide analytics — in one place.
            </p>
            <ul className="mt-8 space-y-2 text-[13px] text-white/75">
              <li>• Geofenced, camera-captured meeting evidence</li>
              <li>• Department-scoped role-based access</li>
              <li>• Live attendance and project health analytics</li>
            </ul>
          </div>
          <p className="text-[12px] text-white/60">
            Prestige Institute of Engineering Management &amp; Research, Indore
          </p>
        </section>

        <section className="relative flex items-center justify-center overflow-hidden px-5 py-12">
          <AnimatedBackground />
          <div className="relative w-full max-w-sm">
            <div className="mb-6 lg:hidden">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-brand-600)] text-lg font-bold text-white">
                P
              </span>
            </div>
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="mt-1 text-[13px] text-[var(--color-muted)]">
              Use the credentials issued by your department office.
            </p>
            <div className="mt-6">
              <LoginForm />
            </div>
            <p className="mt-6 text-[13px] text-[var(--color-muted)]">
              Team lead registering a new project?{" "}
              <Link href="/register" className="font-medium text-[var(--color-brand-600)] underline">
                Register your team
              </Link>
            </p>
          </div>
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}
