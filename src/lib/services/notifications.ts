import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface NotificationInput {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * Writes an in-app notification. Delivery channels are intentionally behind
 * this one function: adding email/push later means extending here, not
 * touching the twenty call sites.
 */
export async function notify(
  client: Prisma.TransactionClient | typeof db,
  userId: string,
  input: NotificationInput,
): Promise<void> {
  await client.notification.create({
    data: {
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    },
  });
}

export async function notifyMany(
  client: Prisma.TransactionClient | typeof db,
  userIds: string[],
  input: NotificationInput,
): Promise<void> {
  for (const userId of new Set(userIds)) await notify(client, userId, input);
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string): Promise<void> {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
