"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/navigation";
import { GlobalSearch } from "@/components/global-search";

export function AppShell({
  navigation,
  user,
  unread,
  children,
}: {
  navigation: NavGroup[];
  user: { name: string; roles: string[] };
  unread: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) => {
    const base = href.split("?")[0];
    return exact ? pathname === base : pathname === base || pathname.startsWith(`${base}/`);
  };

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Top bar */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-line)] bg-white px-3 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="sidebar"
          className="rounded-lg border border-[var(--color-line-strong)] px-2.5 py-1.5 text-[13px] lg:hidden"
        >
          Menu
        </button>

        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-brand-600)] text-[13px] font-bold text-white">
            P
          </span>
          <span className="hidden text-[15px] font-semibold sm:block">PIEMR Project Platform</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <GlobalSearch />
          <Link
            href="/notifications"
            className="relative rounded-lg border border-[var(--color-line-strong)] px-2.5 py-1.5 text-[13px]"
          >
            Alerts
            {unread > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[11px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
          <Link href="/account" className="hidden text-right sm:block">
            <span className="block text-[13px] font-medium leading-tight">{user.name}</span>
            <span className="block text-[11px] text-[var(--color-muted)]">
              {user.roles.map((r) => r.replace(/_/g, " ").toLowerCase()).join(" · ")}
            </span>
          </Link>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav
          id="sidebar"
          aria-label="Primary"
          className={cn(
            "no-print fixed inset-y-14 left-0 z-20 w-64 overflow-y-auto border-r border-[var(--color-line)] bg-white px-3 py-4 transition-transform lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {navigation.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(item.href, item.exact) ? "page" : undefined}
                      className={cn(
                        "block rounded-lg px-2.5 py-1.5 text-[13px]",
                        isActive(item.href, item.exact)
                          ? "bg-[var(--color-brand-50)] font-medium text-[var(--color-brand-700)]"
                          : "text-slate-700 hover:bg-[var(--color-canvas)]",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <form action="/api/auth/logout" method="post" className="px-1 pt-2">
            <button
              type="submit"
              className="w-full rounded-lg border border-[var(--color-line-strong)] px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--color-canvas)]"
            >
              Sign out
            </button>
          </form>
        </nav>

        {open ? (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-14 z-10 bg-slate-900/30 lg:hidden"
          />
        ) : null}

        <main id="main" className="min-w-0 flex-1 px-3 py-5 sm:px-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
