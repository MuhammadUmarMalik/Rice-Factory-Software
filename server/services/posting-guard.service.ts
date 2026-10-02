import { db } from "../models/db";
import { and, gte, lte } from "drizzle-orm";
import { periodLocks } from "../db/schema";

/**
 * Shared posting guard for every write that lands in the books.
 *
 * Extracted from the private `assertPostingAllowed` / `assertPeriodNotLocked`
 * methods on `DatabaseStorage` so the daybook services can enforce the same
 * rules — they were writing straight through the raw sqlite client and bypassed
 * period locks entirely.
 */

type DrizzleClient = typeof db;

/**
 * Callers pass either a Drizzle client (storage.ts, sometimes a transaction
 * client) or the raw better-sqlite3 handle (daybooks.service.ts). Period locks
 * live outside any single transaction, so the raw handle just falls back to the
 * shared Drizzle client rather than needing a second, seconds-vs-milliseconds
 * aware SQL path.
 */
export type PostingGuardClient = DrizzleClient | { prepare: (sql: string) => unknown } | null | undefined;

function resolveClient(client: PostingGuardClient): DrizzleClient {
  return client && typeof (client as DrizzleClient).select === "function" ? (client as DrizzleClient) : db;
}

/**
 * Mirrors `toValidDate` in storage.ts: tolerates epoch seconds, epoch
 * milliseconds, ISO strings and Date instances, falling back to "now" for
 * anything unparseable.
 */
export function toValidDate(value?: string | number | Date | null): Date {
  if (value == null) return new Date();

  if (typeof value === "number") {
    // Support legacy epoch-second values persisted in SQLite.
    const normalized = Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
    const dt = new Date(normalized);
    return Number.isNaN(dt.getTime()) ? new Date() : dt;
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) {
        const normalized = Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric;
        const dt = new Date(normalized);
        return Number.isNaN(dt.getTime()) ? new Date() : dt;
      }
    }
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? new Date() : dt;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }

  return new Date();
}

export function assertPeriodNotLocked(client: PostingGuardClient, postingDate: Date, context: string) {
  const locks = resolveClient(client)
    .select()
    .from(periodLocks)
    .where(and(lte(periodLocks.fromDate, postingDate), gte(periodLocks.toDate, postingDate)))
    .all();
  if (locks.length > 0) {
    const lock = locks[0];
    throw new Error(
      `Period is locked for ${context} (${new Date(lock.fromDate as any).toISOString().slice(0, 10)} to ${new Date(lock.toDate as any).toISOString().slice(0, 10)})`,
    );
  }
}

export function assertPostingAllowed(
  client: PostingGuardClient,
  postingDate: string | number | Date | null | undefined,
  context: string,
) {
  const safeDate = toValidDate(postingDate as any);
  const minAllowed = new Date(1980, 0, 1);
  minAllowed.setHours(0, 0, 0, 0);
  if (safeDate < minAllowed) {
    throw new Error(
      `Date must be on or after ${minAllowed.toISOString().slice(0, 10)} for ${context}`,
    );
  }
  assertPeriodNotLocked(client, safeDate, context);
}
