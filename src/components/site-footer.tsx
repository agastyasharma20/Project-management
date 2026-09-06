/**
 * Shared credit footer for public-facing pages (home, login, register).
 * Kept out of the authenticated app shell deliberately — dashboards stay
 * data-dense and uncluttered; this is where a visitor is reading, not working.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 py-6 text-center text-[12px] text-[var(--color-muted)] sm:flex-row sm:justify-between sm:text-left">
        <p>© {new Date().getFullYear()} Prestige Institute of Engineering Management & Research, Indore</p>
        <p>
          Designed &amp; Developed by:{" "}
          <a href="mailto:hod_cs@piemr.edu.in" className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand-600)] hover:underline">
            Prof. Dr. Piyush Choudhary
          </a>{" "}
          <span className="text-[11px]">[Head&nbsp;–&nbsp;CSE]</span>
          {" & "}
          <a
            href="https://www.linkedin.com/in/agastya20"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand-600)] hover:underline"
          >
            Mr. Agastya Sharma
          </a>
          {" · "}
          <a href="mailto:hod_cs@piemr.edu.in" className="hover:text-[var(--color-brand-600)] hover:underline">
            hod_cs@piemr.edu.in
          </a>
          {" · "}
          <a href="mailto:work.agastya20@gmail.com" className="hover:text-[var(--color-brand-600)] hover:underline">
            work.agastya20@gmail.com
          </a>
        </p>
      </div>
    </footer>
  );
}
