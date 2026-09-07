import { env } from "@/lib/env";

/**
 * Shared credit footer for public-facing pages (home, login, register).
 * Kept out of the authenticated app shell's main content deliberately —
 * dashboards stay data-dense and uncluttered; a compact version lives in the
 * app shell separately.
 *
 * Deliberately reads names/emails/links from environment variables rather
 * than hardcoding them: this component ships with zero personal information
 * in source control. A deployer who wants a named credit sets CREDIT_NAME_1 /
 * CREDIT_TITLE_1 / CREDIT_EMAIL_1 / CREDIT_NAME_2 / CREDIT_EMAIL_2 /
 * CREDIT_LINKEDIN_2 in their own untracked .env. With none set, the footer
 * shows a generic institutional line naming no individual.
 */
/**
 * One-line variant for the authenticated app shell's footer. A Server
 * Component (reads env() directly) rendered by the (app) layout and passed
 * into the client-side AppShell as a prop — same env-configured, no-PII-in-
 * source approach as SiteFooter above. Renders nothing when no credit is
 * configured, keeping the dashboard footer minimal by default.
 */
export function CompactCredit() {
  const e = env();
  if (!e.CREDIT_NAME_1 && !e.CREDIT_NAME_2) return null;

  const names = [e.CREDIT_NAME_1, e.CREDIT_NAME_2].filter((v): v is string => Boolean(v));

  return (
    <p className="no-print mt-10 border-t border-[var(--color-line)] pt-4 text-center text-[11px] text-[var(--color-muted)]">
      Designed &amp; Developed by: {names.join(" & ")}
    </p>
  );
}

export function SiteFooter() {
  const e = env();
  const hasCredit = Boolean(e.CREDIT_NAME_1 || e.CREDIT_NAME_2);

  return (
    <footer className="border-t border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 py-6 text-center text-[12px] text-[var(--color-muted)] sm:flex-row sm:justify-between sm:text-left">
        <p>© {new Date().getFullYear()} Prestige Institute of Engineering Management & Research, Indore</p>
        {hasCredit ? (
          <p>
            Designed &amp; Developed by:{" "}
            {e.CREDIT_NAME_1 ? (
              <>
                {e.CREDIT_EMAIL_1 ? (
                  <a
                    href={`mailto:${e.CREDIT_EMAIL_1}`}
                    className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand-600)] hover:underline"
                  >
                    {e.CREDIT_NAME_1}
                  </a>
                ) : (
                  <span className="font-medium text-[var(--color-ink)]">{e.CREDIT_NAME_1}</span>
                )}{" "}
                {e.CREDIT_TITLE_1 ? <span className="text-[11px]">[{e.CREDIT_TITLE_1}]</span> : null}
              </>
            ) : null}
            {e.CREDIT_NAME_1 && e.CREDIT_NAME_2 ? " & " : null}
            {e.CREDIT_NAME_2 ? (
              e.CREDIT_LINKEDIN_2 ? (
                <a
                  href={e.CREDIT_LINKEDIN_2}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand-600)] hover:underline"
                >
                  {e.CREDIT_NAME_2}
                </a>
              ) : (
                <span className="font-medium text-[var(--color-ink)]">{e.CREDIT_NAME_2}</span>
              )
            ) : null}
            {e.CREDIT_EMAIL_1 || e.CREDIT_EMAIL_2 ? (
              <>
                {" · "}
                {[e.CREDIT_EMAIL_1, e.CREDIT_EMAIL_2]
                  .filter((v): v is string => Boolean(v))
                  .map((email, i, arr) => (
                    <span key={email}>
                      <a href={`mailto:${email}`} className="hover:text-[var(--color-brand-600)] hover:underline">
                        {email}
                      </a>
                      {i < arr.length - 1 ? " · " : null}
                    </span>
                  ))}
              </>
            ) : null}
          </p>
        ) : (
          <p>Project Intelligence &amp; Management Platform</p>
        )}
      </div>
    </footer>
  );
}
