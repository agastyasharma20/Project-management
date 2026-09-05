import Link from "next/link";
import { Card, CardBody, PageHeader } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Not found" description="This record does not exist, or it is outside your scope." />
      <Card>
        <CardBody className="text-[13px]">
          <p>
            Records you are not permitted to see are indistinguishable from records that do not exist, by design.
          </p>
          <p className="mt-2">
            <Link href="/dashboard" className="text-[var(--color-brand-600)] underline">
              Return to your dashboard
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
