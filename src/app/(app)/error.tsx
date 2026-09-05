"use client";

import Link from "next/link";
import { Button, Card, CardBody, PageHeader } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Something went wrong" description="The page could not be loaded." />
      <Card>
        <CardBody className="space-y-3 text-[13px]">
          <p>
            An unexpected error occurred while preparing this view. Nothing you were doing has been saved. Try
            again, and if it keeps happening quote the reference below to your administrator.
          </p>
          {error.digest ? (
            <p className="text-[var(--color-muted)]">
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <Link href="/dashboard">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
