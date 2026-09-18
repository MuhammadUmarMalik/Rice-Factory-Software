/**
 * Notification persistence, extracted from the "// Notifications" section of
 * storage.ts.
 *
 * Every read and write is scoped by `userId` — a notification is addressed to
 * one user, and the mark-read paths must not let one user clear another's
 * inbox by guessing an id.
 */
import { db } from "./db";
import { and, desc, eq } from "drizzle-orm";
import { notifications, type Notification, type InsertNotification } from "../db/schema";

export async function listNotifications(userId: number, limit = 50): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.id))
    .limit(limit)
    .all();
}

export async function createNotification(
  notification: InsertNotification,
): Promise<Notification> {
  const [created] = await db.insert(notifications).values(notification).returning();
  return created;
}

export async function markNotificationRead(id: number, userId: number): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .run();
  return result.changes > 0;
}

export async function markAllNotificationsRead(userId: number): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, userId))
    .run();
  return result.changes || 0;
}
