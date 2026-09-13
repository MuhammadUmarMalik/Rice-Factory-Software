/**
 * Period lock persistence, extracted from the "// Period locks" section of
 * storage.ts.
 *
 * These rows are only the storage of the locks; the rules that read them and
 * reject a posting live in ../services/posting-guard.service.
 */
import { db } from "./db";
import { desc, eq } from "drizzle-orm";
import { periodLocks, type PeriodLock, type InsertPeriodLock } from "../db/schema";

export async function getPeriodLocks(): Promise<PeriodLock[]> {
  return db.select().from(periodLocks).orderBy(desc(periodLocks.id)).all();
}

export async function createPeriodLock(lock: InsertPeriodLock): Promise<PeriodLock> {
  const [created] = await db.insert(periodLocks).values(lock as any).returning();
  return created;
}

export async function deletePeriodLock(id: number): Promise<boolean> {
  const result = await db.delete(periodLocks).where(eq(periodLocks.id, id)).run();
  return result.changes > 0;
}
