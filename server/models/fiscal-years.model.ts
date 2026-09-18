/**
 * Fiscal year / period persistence, extracted from the
 * "// Fiscal Years / Periods" section of storage.ts.
 *
 * A fiscal year owns a row per calendar month (`fiscal_periods`) and an
 * opening balance per account (`fiscal_opening_balances`). Creating a year and
 * rolling one forward both have to produce all three sets of rows or none, so
 * each runs in a single transaction with a client-parameterised helper.
 */
import { db } from "./db";
import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import {
  accounts,
  fiscalYears,
  fiscalPeriods,
  fiscalOpeningBalances,
  ledgerEntries,
} from "../db/schema";
import { parseAmount } from "../utils/parse";
import { endOfMonth, startOfMonth, toYearMonth } from "../utils/dates";

/** Either the shared client or a transaction-scoped one. */
type DbClient = typeof db;

type PerformedBy = { userId?: number; role?: string };

export async function getFiscalYears() {
  return db.select().from(fiscalYears).orderBy(fiscalYears.startDate).all();
}

export async function getFiscalPeriods(fiscalYearId: number) {
  return db
    .select()
    .from(fiscalPeriods)
    .where(eq(fiscalPeriods.fiscalYearId, fiscalYearId))
    .orderBy(fiscalPeriods.periodStart)
    .all();
}

/**
 * Walks month by month from `start` to `end`, inserting one period per month.
 * The cursor is pinned to the 1st at midnight first: advancing by month from,
 * say, the 31st skips February entirely.
 */
function generatePeriodsForYear(client: DbClient, fiscalYearId: number, start: Date, end: Date) {
  const cursor = new Date(start);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const periodStart = startOfMonth(cursor);
    const periodEnd = endOfMonth(cursor);
    client.insert(fiscalPeriods).values({
      fiscalYearId,
      yearMonth: toYearMonth(cursor),
      periodStart,
      periodEnd,
      isClosed: false as any,
    } as any).run();
    cursor.setMonth(cursor.getMonth() + 1);
  }
}

export async function createFiscalYear(
  data: { name: string; startDate: Date; endDate: Date; status?: "draft" | "open" | "closed" },
  performedBy?: PerformedBy,
) {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const overlap = client
      .select()
      .from(fiscalYears)
      .where(
        or(
          and(lte(fiscalYears.startDate, data.startDate), gte(fiscalYears.endDate, data.startDate)),
          and(lte(fiscalYears.startDate, data.endDate), gte(fiscalYears.endDate, data.endDate)),
        ),
      )
      .all();
    if (overlap.length > 0) {
      throw new Error("Fiscal year overlaps an existing year");
    }

    const fy = client.insert(fiscalYears).values({
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status || "draft",
      createdBy: performedBy?.userId,
      createdAt: new Date(),
    } as any).returning().get();

    generatePeriodsForYear(client, fy.id, data.startDate, data.endDate);

    const accs = client.select().from(accounts).all();
    for (const acc of accs) {
      client.insert(fiscalOpeningBalances).values({
        fiscalYearId: fy.id,
        accountId: acc.id,
        openingBalance: acc.openingBalance || "0",
        createdBy: performedBy?.userId,
        createdAt: new Date(),
      } as any).run();
    }

    return fy as any;
  });
}

export async function setFiscalYearStatus(
  fiscalYearId: number,
  status: "draft" | "open" | "closed",
  performedBy?: PerformedBy,
) {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const [existing] = client.select().from(fiscalYears).where(eq(fiscalYears.id, fiscalYearId)).all();
    if (!existing) return undefined;

    if (status === "closed") {
      // Closing the year closes every period inside it, otherwise the
      // period-lock guard would still accept postings into an open month.
      client
        .update(fiscalPeriods)
        .set({ isClosed: true as any, closedBy: performedBy?.userId, closedAt: new Date() })
        .where(eq(fiscalPeriods.fiscalYearId, fiscalYearId))
        .run();
    }

    const [updated] = client
      .update(fiscalYears)
      .set({ status })
      .where(eq(fiscalYears.id, fiscalYearId))
      .returning()
      .all();
    return updated as any;
  });
}

export async function setFiscalPeriodClosed(
  periodId: number,
  isClosed: boolean,
  performedBy?: PerformedBy,
) {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const [existing] = client.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, periodId)).all();
    if (!existing) return undefined;

    const [updated] = client
      .update(fiscalPeriods)
      .set({
        isClosed: isClosed as any,
        closedBy: isClosed ? performedBy?.userId : null,
        closedAt: isClosed ? new Date() : null,
      })
      .where(eq(fiscalPeriods.id, periodId))
      .returning()
      .all();
    return updated as any;
  });
}

/**
 * Debit-positive balance of an account at `asOf`.
 *
 * When `asOf` falls inside a fiscal year the year's own opening balance is the
 * starting point and only movements from that year's start count; carrying the
 * account's original opening balance forward as well would double-count every
 * prior year.
 */
function computeBalanceAsOf(client: DbClient, accountId: number, asOf: Date): number {
  const [acc] = client.select().from(accounts).where(eq(accounts.id, accountId)).all();
  if (!acc) return 0;

  const [fy] = client
    .select()
    .from(fiscalYears)
    .where(and(lte(fiscalYears.startDate, asOf), gte(fiscalYears.endDate, asOf)))
    .all();

  let opening = parseAmount(acc.openingBalance || "0");
  if (fy) {
    const [fyOb] = client
      .select()
      .from(fiscalOpeningBalances)
      .where(and(eq(fiscalOpeningBalances.fiscalYearId, fy.id), eq(fiscalOpeningBalances.accountId, accountId)))
      .all();
    if (fyOb) {
      opening = parseAmount(fyOb.openingBalance);
    }
    // add movements from fiscal year start to asOf
    const [movementRow] = client
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'debit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.accountId, accountId), gte(ledgerEntries.entryDate, fy.startDate), lte(ledgerEntries.entryDate, asOf)))
      .all();
    opening += parseAmount(movementRow?.total || "0");
  } else {
    const [movementRow] = client
      .select({
        total: sql<string>`COALESCE(SUM(CASE WHEN ${ledgerEntries.transactionType} = 'debit' THEN CAST(${ledgerEntries.amount} AS REAL) ELSE -CAST(${ledgerEntries.amount} AS REAL) END), 0)`,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.accountId, accountId), lte(ledgerEntries.entryDate, asOf)))
      .all();
    opening += parseAmount(movementRow?.total || "0");
  }
  return opening;
}

/**
 * Creates the next fiscal year, seeding each account's opening balance from its
 * closing balance on the source year's last day.
 */
export async function rollForwardOpeningBalances(
  fromFiscalYearId: number,
  to: { name: string; startDate: Date; endDate: Date },
  performedBy?: PerformedBy,
) {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const [fromFy] = client.select().from(fiscalYears).where(eq(fiscalYears.id, fromFiscalYearId)).all();
    if (!fromFy) throw new Error("Source fiscal year not found");

    const nextFy = client
      .insert(fiscalYears)
      .values({
        name: to.name,
        startDate: to.startDate,
        endDate: to.endDate,
        status: "draft",
        createdBy: performedBy?.userId,
        createdAt: new Date(),
      } as any)
      .returning()
      .get();

    generatePeriodsForYear(client, nextFy.id, to.startDate, to.endDate);

    const accs = client.select().from(accounts).all();
    for (const acc of accs) {
      const closing = computeBalanceAsOf(client, acc.id, new Date(fromFy.endDate as any));
      client.insert(fiscalOpeningBalances).values({
        fiscalYearId: nextFy.id,
        accountId: acc.id,
        openingBalance: closing.toString(),
        createdBy: performedBy?.userId,
        createdAt: new Date(),
      } as any).run();
    }

    return nextFy as any;
  });
}
