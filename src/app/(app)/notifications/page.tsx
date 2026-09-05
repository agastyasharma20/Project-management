import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requirePrincipal } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { markAllRead } from "@/lib/services/notifications";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const principal = await requirePrincipal();

  const notifications = await db.notification.findMany({
    where: { userId: principal.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  async function markRead() {
    "use server";
    const me = await requirePrincipal();
    await markAllRead(me.userId);
    revalidatePath("/notifications");
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Approvals, schedules and alerts. Email delivery plugs into the same service."
        action={
          <form action={markRead}>
            <Button type="submit" variant="secondary">
              Mark all read
            </Button>
          </form>
        }
      />

      <Card>
        <CardHeader title={`${notifications.filter((n) => !n.readAt).length} unread`} />
        {notifications.length ? (
          <ul className="divide-y divide-[var(--color-line)]">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    {n.link ? (
                      <Link href={n.link} className="text-[var(--color-brand-600)] hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                  </p>
                  {n.body ? <p className="text-[13px] text-[var(--color-muted)]">{n.body}</p> : null}
                  <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">{formatDateTime(n.createdAt)}</p>
                </div>
                {!n.readAt ? <Badge tone="brand">new</Badge> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing yet" description="Notifications appear here as things happen." />
        )}
      </Card>
    </>
  );
}
