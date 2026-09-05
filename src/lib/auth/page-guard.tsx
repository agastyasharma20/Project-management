import type { ReactNode } from "react";
import Link from "next/link";
import { canAny, type Permission, type Principal } from "@/lib/auth/rbac";
import { Card, CardBody, PageHeader } from "@/components/ui";

/**
 * Page-level authorisation. Returns a rendered "permission denied" state when
 * the principal lacks every listed permission, so a user never lands on a blank
 * screen or a server error.
 *
 * This is a *presentation* guard. Server actions and services still enforce the
 * same permissions independently — the UI check is never the security boundary.
 */
export function guard(principal: Principal, permissions: Permission[]): ReactNode | null {
  if (canAny(principal, permissions)) return null;
  return <PermissionDenied />;
}

export function PermissionDenied() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Permission denied" description="This area is outside your role's access." />
      <Card>
        <CardBody className="space-y-3 text-[13px]">
          <p>
            Your account does not hold the permission required for this page. If you believe this is wrong, ask
            your department office or an administrator to review your roles.
          </p>
          <p>
            <Link href="/dashboard" className="text-[var(--color-brand-600)] underline">
              Return to your dashboard
            </Link>
            {" · "}
            <Link href="/account" className="text-[var(--color-brand-600)] underline">
              See my permissions
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
