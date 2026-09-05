"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface SearchHit {
  kind: string;
  label: string;
  sub: string;
  href: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (res.ok) setHits((await res.json()) as SearchHit[]);
      } catch {
        /* aborted or offline — the empty state covers it */
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor="global-search" className="sr-only">
        Search teams, students, faculty
      </label>
      <input
        id="global-search"
        type="search"
        value={query}
        placeholder="Search PIEMR-CSE-001, name, enrollment…"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="h-9 w-40 rounded-lg border border-[var(--color-line-strong)] bg-white px-3 text-[13px] sm:w-72"
      />
      {open && query.trim().length >= 2 ? (
        <div className="absolute right-0 top-11 z-40 w-[min(92vw,26rem)] overflow-hidden rounded-xl border border-[var(--color-line)] bg-white shadow-lg">
          {loading ? (
            <p className="px-3 py-3 text-[13px] text-[var(--color-muted)]">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-[var(--color-muted)]">No matches in your scope.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {hits.map((hit) => (
                <li key={`${hit.kind}-${hit.href}-${hit.label}`}>
                  <Link
                    href={hit.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-[var(--color-canvas)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{hit.label}</span>
                      <span className="block truncate text-[12px] text-[var(--color-muted)]">{hit.sub}</span>
                    </span>
                    <span className="shrink-0 rounded bg-[var(--color-canvas)] px-1.5 py-0.5 text-[11px] uppercase text-[var(--color-muted)]">
                      {hit.kind}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
