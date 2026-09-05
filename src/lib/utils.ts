import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const IST = "Asia/Kolkata";

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: IST,
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: IST,
  }).format(new Date(date));
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function relativeDays(date: Date | null): string {
  if (!date) return "never";
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Reads a `?key=value` search param as a single string. */
export function param(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const raw = searchParams[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length ? value : undefined;
}

export function pageFrom(searchParams: Record<string, string | string[] | undefined>, size: number) {
  const page = Math.max(1, Number(param(searchParams, "page") ?? 1) || 1);
  return { page, skip: (page - 1) * size, take: size };
}
