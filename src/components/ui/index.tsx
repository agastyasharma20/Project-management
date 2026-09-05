import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Card */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

/* ---------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-700)]",
  secondary:
    "border border-[var(--color-line-strong)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-brand-50)]",
  ghost: "text-[var(--color-muted)] hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)]",
  danger: "bg-[var(--color-danger)] text-white hover:brightness-110",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/* ----------------------------------------------------------------- Badge */

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  success: "bg-[var(--color-success-soft)] text-[var(--color-success)] ring-green-200",
  warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] ring-amber-200",
  danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] ring-red-200",
  info: "bg-[var(--color-info-soft)] text-[var(--color-info)] ring-sky-200",
  brand: "bg-[var(--color-brand-50)] text-[var(--color-brand-700)] ring-blue-200",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

const STATUS_TONES: Record<string, Tone> = {
  APPROVED: "success",
  ACTIVE: "success",
  PUBLISHED: "success",
  SUBMITTED: "info",
  PENDING_APPROVAL: "warning",
  RESUBMISSION_REQUIRED: "warning",
  SCHEDULED: "info",
  IN_PROGRESS: "info",
  DRAFT: "neutral",
  REGISTERED: "neutral",
  COMPLETED: "brand",
  REVIEWED: "brand",
  REJECTED: "danger",
  CANCELLED: "danger",
  ARCHIVED: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

/* ----------------------------------------------------------------- Forms */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const describedBy = [hint ? `${htmlFor}-hint` : null, error ? `${htmlFor}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-[var(--color-ink)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--color-danger)]">*</span> : null}
      </label>
      {React.isValidElement(children) && describedBy
        ? React.cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, {
            "aria-describedby": describedBy,
          })
        : children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-[12px] text-[var(--color-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[12px] text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-lg border border-[var(--color-line-strong)] bg-white px-3 text-sm text-[var(--color-ink)] placeholder:text-slate-400 disabled:bg-slate-50";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "py-2", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, "h-10 pr-8", className)} {...props} />;
}

/* ----------------------------------------------------------------- Table */

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="scroll-x">
      <table className={cn("w-full min-w-[640px] text-left text-[13px]", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-[var(--color-line)] bg-[var(--color-canvas)] px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-[var(--color-line)] px-3 py-2 align-middle", className)} {...props} />;
}

/* ------------------------------------------------------------ Data states */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-[13px] text-[var(--color-muted)]">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-[var(--color-danger-soft)] px-4 py-3 text-[13px] text-[var(--color-danger)]"
    >
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-0.5">{description}</p> : null}
    </div>
  );
}

export function SuccessNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-green-200 bg-[var(--color-success-soft)] px-4 py-3 text-[13px] text-[var(--color-success)]">
      {children}
    </div>
  );
}

export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-sky-200 bg-[var(--color-info-soft)] px-4 py-3 text-[13px] text-[var(--color-info)]">
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- KPI card */

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
}) {
  const accent: Record<Tone, string> = {
    neutral: "text-[var(--color-ink)]",
    success: "text-[var(--color-success)]",
    warning: "text-[var(--color-warning)]",
    danger: "text-[var(--color-danger)]",
    info: "text-[var(--color-info)]",
    brand: "text-[var(--color-brand-600)]",
  };
  return (
    <div className="card p-4">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-semibold", accent[tone])}>{value}</p>
      {sub ? <p className="mt-1 text-[12px] text-[var(--color-muted)]">{sub}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------- Page head */

export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1 text-[12px] text-[var(--color-muted)]">{breadcrumb}</div> : null}
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-[var(--color-muted)]">{description}</p> : null}
      </div>
      {action ? <div className="no-print shrink-0">{action}</div> : null}
    </header>
  );
}

/* ------------------------------------------------------------- Health pill */

export function HealthPill({ score, label }: { score: number; label: string }) {
  const tone: Tone = score >= 90 ? "success" : score >= 75 ? "info" : score >= 50 ? "warning" : "danger";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular text-[13px] font-semibold">{score}</span>
      <Badge tone={tone}>{label}</Badge>
    </span>
  );
}

/* ------------------------------------------------------------- Pagination */

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  query,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  query: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav className="flex items-center justify-between gap-2 px-4 py-3 text-[13px]" aria-label="Pagination">
      <span className="text-[var(--color-muted)]">
        Page {page} of {pages} · {total} records
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <ButtonLink size="sm" href={href(page - 1)}>
            Previous
          </ButtonLink>
        ) : null}
        {page < pages ? (
          <ButtonLink size="sm" href={href(page + 1)}>
            Next
          </ButtonLink>
        ) : null}
      </div>
    </nav>
  );
}
