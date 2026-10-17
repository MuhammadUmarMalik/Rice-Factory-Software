/**
 * Gate Pass persistence.
 *
 * A gate pass is a *physical control* document: it records a vehicle crossing
 * the mill gate (IN when a load arrives, OUT when a load is dispatched) and is
 * deliberately not a posting document. Nothing here touches the ledger,
 * account balances or product stock — Purchase, Sale and Processing remain the
 * only writers of those — so a gate pass can be issued, completed or cancelled
 * without disturbing the books.
 *
 * It does, however, enforce the physical rules around the movement:
 *   - only one purchase can be raised from a given IN pass,
 *   - a sale's dispatched bags/weight (summed over its non-cancelled OUT
 *     passes) may never exceed the sale line quantities,
 *   - a sale or purchase with a live pass cannot be deleted,
 *   - a completed pass is immutable (only cancellation is allowed),
 *   - locked fiscal periods block create/complete/cancel.
 *
 * Weight is stored as integer grams so weighbridge values never drift;
 * `kgToG` / `gToKg` convert to the decimal-kg strings the rest of the app uses.
 */
import { db, sqlite } from "./db";
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import {
  accounts,
  auditLogs,
  fiscalYears,
  gatePassItems,
  gatePasses,
  processing,
  processingOutputs,
  products,
  purchaseItems,
  purchases,
  sales,
  saleItems,
  type GatePass,
} from "../db/schema";
import { assertPostingAllowed, toValidDate } from "../services/posting-guard.service";
import { parseAmount } from "../utils/parse";
import type {
  GatePassCreateInput,
  GatePassDirection,
  GatePassSourceType,
  GatePassStatus,
} from "../schemas/gate-passes.schema";

export type { GatePassCreateInput } from "../schemas/gate-passes.schema";

/** Either the shared client or a transaction-scoped one. */
type DbClient = typeof db;
type AuditAction = "create" | "complete" | "cancel" | "link_purchase";

// ---------------------------------------------------------------------------
// Weight helpers
// ---------------------------------------------------------------------------

/** Decimal kilograms (string or number) to integer grams. */
export function kgToG(kg: string | number | null | undefined): number {
  if (kg == null || kg === "") return 0;
  return Math.round(parseAmount(kg) * 1000);
}

/** Integer grams to a decimal-kilogram string ("1500" -> "1.5"). */
export function gToKg(g: number | null | undefined): string {
  if (g == null) return "0";
  return (g / 1000).toString();
}

/**
 * Compares a pass's weighbridge net against the net of the document it is
 * linked to. A difference larger than `toleranceRatio` (0.5% by default)
 * usually means a typo on one side. Returns the difference/ratio when the
 * threshold is crossed, otherwise null (including when either side is missing
 * or the reference is zero, so there is nothing meaningful to compare).
 */
export function weighbridgeMismatch(
  passNetG: number | null | undefined,
  referenceNetG: number | null | undefined,
  toleranceRatio = 0.005,
): { diffG: number; ratio: number } | null {
  if (passNetG == null || referenceNetG == null || referenceNetG <= 0) return null;
  const diffG = Math.abs(passNetG - referenceNetG);
  const ratio = diffG / referenceNetG;
  return ratio > toleranceRatio ? { diffG, ratio } : null;
}

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export type GatePassItemView = {
  id: number;
  productId: number;
  productName: string | null;
  productNameUrdu: string | null;
  bags: number;
  weightG: number;
  weightKg: string;
  saleItemId: number | null;
  purchaseItemId: number | null;
};

export type GatePassLinkedDocument = {
  type: GatePassSourceType;
  id: number;
  number: string;
  label: string;
  date: Date | null;
};

export type GatePassDetail = GatePass & {
  items: GatePassItemView[];
  totalBags: number;
  totalWeightG: number;
  totalWeightKg: string;
  partyName: string | null;
  linkedDocument: GatePassLinkedDocument | null;
  /**
   * Set when the weighbridge net disagrees with the linked document's net by
   * more than half a percent. A warning, not an error: the munshi can still
   * complete the pass after checking which side was mis-keyed.
   */
  weighbridgeWarning: string | null;
};

export type GatePassListRow = {
  id: number;
  number: string;
  direction: GatePassDirection;
  status: GatePassStatus;
  issuedAt: Date;
  completedAt: Date | null;
  vehicleNo: string | null;
  driverName: string | null;
  partyId: number | null;
  partyName: string | null;
  sourceType: GatePassSourceType | null;
  sourceId: number | null;
  netG: number | null;
  totalBags: number;
  totalWeightG: number;
  itemCount: number;
};

export type GatePassListFilters = {
  from?: string | number | Date | null;
  to?: string | number | Date | null;
  direction?: GatePassDirection | null;
  status?: GatePassStatus | null;
  partyId?: number | null;
  vehicleNo?: string | null;
};

export type DispatchLineStatus = "not_dispatched" | "partly_dispatched" | "fully_dispatched";

export type DispatchItemSummary = {
  productId: number;
  productName: string | null;
  orderedKg: number;
  dispatchedKg: number;
  pendingKg: number;
  orderedBags: number | null;
  dispatchedBags: number;
  status: DispatchLineStatus;
};

export type SaleDispatchSummary = {
  saleId: number;
  invoiceNumber: string;
  status: DispatchLineStatus;
  orderedKg: number;
  dispatchedKg: number;
  pendingKg: number;
  items: DispatchItemSummary[];
  passes: GatePassListRow[];
};

export type GatePassDashboard = {
  vehiclesInside: number;
  dispatchedBagsToday: number;
  openPasses: number;
  staleOpenPasses: GatePassListRow[];
};

/** A compact reference to a gate pass, for embedding in another document. */
export type LinkedGatePassRef = {
  id: number;
  number: string;
  status: GatePassStatus;
  direction: GatePassDirection;
};

/** Per-sale dispatch roll-up used by the sale list badges. */
export type SaleDispatchProgress = {
  saleId: number;
  status: DispatchLineStatus;
  orderedKg: number;
  dispatchedKg: number;
  pendingKg: number;
  orderedBags: number | null;
  dispatchedBags: number;
};

type SourceTotal = { weightG: number; bags: number | null };

// ---------------------------------------------------------------------------
// Small internal helpers
// ---------------------------------------------------------------------------

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

function endOfDay(value: string | number | Date): Date {
  const date = toValidDate(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function productName(client: DbClient, productId: number): string {
  const [row] = client
    .select({ name: products.name })
    .from(products)
    .where(eq(products.id, productId))
    .all();
  return row?.name ?? `#${productId}`;
}

function productExists(client: DbClient, productId: number): boolean {
  const [row] = client
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .all();
  return Boolean(row);
}

function resolveFiscalYearId(client: DbClient, date: Date): number | null {
  const [year] = client
    .select({ id: fiscalYears.id })
    .from(fiscalYears)
    .where(and(lte(fiscalYears.startDate, date), gte(fiscalYears.endDate, date)))
    .all();
  return year?.id ?? null;
}

/**
 * Per-prefix sequence. The shared `nextDocumentSequence` takes the max suffix
 * across *all* rows, which would interleave GPI and GPO; gate passes need one
 * sequence per direction per year, so the number is matched by prefix first.
 */
function nextNumberForPrefix(prefix: string): number {
  const row = sqlite
    .prepare(
      `SELECT COALESCE(MAX(CAST(substr(number, ?) AS INTEGER)), 0) AS maxSeq
         FROM gate_passes
        WHERE number LIKE ? || '%'`,
    )
    .get(prefix.length + 1, prefix) as { maxSeq: number } | undefined;
  const maxSeq = Number(row?.maxSeq ?? 0);
  return (Number.isFinite(maxSeq) && maxSeq > 0 ? maxSeq : 0) + 1;
}

function writeGatePassAudit(
  client: DbClient,
  entityId: number,
  action: AuditAction,
  before: unknown,
  after: unknown,
  performedBy?: number,
): void {
  client
    .insert(auditLogs)
    .values({
      entity: "gate_pass",
      entityId,
      action,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
      performedBy: performedBy ?? null,
      source: "api",
    })
    .run();
}

/**
 * Normalises the optional weighbridge block. When gross and tare are both
 * present net defaults to their difference, but an explicit net that disagrees
 * is rejected so a pass can never claim weight that does not add up.
 */
function resolveWeights(input: GatePassCreateInput): {
  grossG: number | null;
  tareG: number | null;
  netG: number | null;
} {
  const grossG = input.grossG ?? null;
  const tareG = input.tareG ?? null;
  let netG = input.netG ?? null;

  if (grossG != null && tareG != null) {
    if (tareG > grossG) throw new Error("Tare weight cannot exceed gross weight");
    const computed = grossG - tareG;
    if (netG == null) netG = computed;
    else if (netG !== computed) {
      throw new Error(
        `Net weight must equal gross weight minus tare weight (${gToKg(grossG)} - ${gToKg(tareG)} = ${gToKg(computed)} kg)`,
      );
    }
  }
  if (netG != null && grossG != null && netG > grossG) {
    throw new Error("Net weight cannot exceed gross weight");
  }
  return { grossG, tareG, netG };
}

// ---------------------------------------------------------------------------
// Source-document quantities (the caps an OUT pass is measured against)
// ---------------------------------------------------------------------------

function addSourceTotal(
  totals: Map<number, SourceTotal>,
  productId: number,
  weightG: number,
  bags: number | null,
): void {
  const prev = totals.get(productId);
  if (prev) {
    prev.weightG += weightG;
    if (bags != null) prev.bags = (prev.bags ?? 0) + bags;
  } else {
    totals.set(productId, { weightG, bags });
  }
}

/** Weight (grams) and optional bags available per product on the source doc. */
function getSourceProductTotalsG(
  client: DbClient,
  sourceType: GatePassSourceType,
  sourceId: number,
): Map<number, SourceTotal> {
  const totals = new Map<number, SourceTotal>();

  if (sourceType === "SALE") {
    const rows = client.select().from(saleItems).where(eq(saleItems.saleId, sourceId)).all();
    for (const row of rows) addSourceTotal(totals, row.productId, kgToG(row.quantityKg), null);
  } else if (sourceType === "PURCHASE") {
    const rows = client
      .select()
      .from(purchaseItems)
      .where(and(eq(purchaseItems.purchaseId, sourceId), isNull(purchaseItems.deletedAt)))
      .all();
    for (const row of rows) {
      addSourceTotal(totals, row.productId, kgToG(row.netWeightKg), Math.round(parseAmount(row.bags)));
    }
  } else if (sourceType === "JOB_RECEIVE") {
    const [batch] = client.select().from(processing).where(eq(processing.id, sourceId)).all();
    if (batch) addSourceTotal(totals, batch.sourceProductId, kgToG(batch.sourceQuantity), null);
  } else if (sourceType === "JOB_RETURN") {
    const rows = client
      .select()
      .from(processingOutputs)
      .where(eq(processingOutputs.processingId, sourceId))
      .all();
    for (const row of rows) addSourceTotal(totals, row.productId, kgToG(row.quantity), null);
  }

  return totals;
}

/** Weight already dispatched by the source document's non-cancelled OUT passes. */
function getDispatchedByProductG(
  client: DbClient,
  sourceType: GatePassSourceType,
  sourceId: number,
  excludePassId?: number,
): Map<number, SourceTotal> {
  const conditions = [
    eq(gatePasses.sourceType, sourceType),
    eq(gatePasses.sourceId, sourceId),
    eq(gatePasses.direction, "OUT"),
    ne(gatePasses.status, "CANCELLED"),
  ];
  if (excludePassId != null) conditions.push(ne(gatePasses.id, excludePassId));

  const rows = client
    .select({
      productId: gatePassItems.productId,
      weightG: gatePassItems.weightG,
      bags: gatePassItems.bags,
    })
    .from(gatePassItems)
    .innerJoin(gatePasses, eq(gatePassItems.gatePassId, gatePasses.id))
    .where(and(...conditions))
    .all();

  const totals = new Map<number, SourceTotal>();
  for (const row of rows) addSourceTotal(totals, row.productId, row.weightG, row.bags);
  return totals;
}

/**
 * Rejects an OUT pass whose items would push the dispatched total past what the
 * linked document provides. Tolerance is a single gram so a rounding-boundary
 * dispatch of the full quantity still passes.
 */
function assertDispatchWithinSource(
  client: DbClient,
  sourceType: GatePassSourceType,
  sourceId: number,
  items: GatePassCreateInput["items"],
  excludePassId?: number,
): void {
  const source = getSourceProductTotalsG(client, sourceType, sourceId);
  if (source.size === 0) {
    throw new Error(`Invalid source: linked ${sourceType.toLowerCase()} document not found or has no items`);
  }
  const dispatched = getDispatchedByProductG(client, sourceType, sourceId, excludePassId);

  for (const item of items) {
    const allowed = source.get(item.productId);
    if (!allowed) {
      throw new Error(
        `Invalid item: product ${productName(client, item.productId)} is not part of the linked document`,
      );
    }
    const alreadyG = dispatched.get(item.productId)?.weightG ?? 0;
    const nextG = alreadyG + (item.weightG ?? 0);
    if (nextG > allowed.weightG + 1) {
      throw new Error(
        `Dispatched weight for ${productName(client, item.productId)} cannot exceed the linked document quantity. ` +
          `Allowed: ${gToKg(allowed.weightG)} kg, already dispatched: ${gToKg(alreadyG)} kg, this pass: ${gToKg(item.weightG ?? 0)} kg`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

function resolveLinkedDocument(
  client: DbClient,
  sourceType: GatePassSourceType | null,
  sourceId: number | null,
): GatePassLinkedDocument | null {
  if (!sourceType || sourceId == null) return null;

  if (sourceType === "SALE") {
    const [row] = client
      .select({ number: sales.invoiceNumber, date: sales.saleDate })
      .from(sales)
      .where(eq(sales.id, sourceId))
      .all();
    if (!row) return null;
    return { type: sourceType, id: sourceId, number: row.number, label: "Sale", date: row.date };
  }
  if (sourceType === "PURCHASE") {
    const [row] = client
      .select({ number: purchases.invoiceNumber, date: purchases.purchaseDate })
      .from(purchases)
      .where(eq(purchases.id, sourceId))
      .all();
    if (!row) return null;
    return { type: sourceType, id: sourceId, number: row.number, label: "Purchase", date: row.date };
  }
  if (sourceType === "JOB_RECEIVE" || sourceType === "JOB_RETURN") {
    const [row] = client
      .select({ number: processing.batchNumber, date: processing.startDate })
      .from(processing)
      .where(eq(processing.id, sourceId))
      .all();
    if (!row) return null;
    return {
      type: sourceType,
      id: sourceId,
      number: row.number,
      label: sourceType === "JOB_RECEIVE" ? "Job Work Receive" : "Job Work Return",
      date: row.date,
    };
  }
  return null;
}

/**
 * Net weight (grams) the linked document carries, used to warn when a pass's
 * weighbridge net disagrees with it by more than half a percent. Only Sale and
 * Purchase link a weighbridge reading to a document net; job-work passes have
 * no comparable figure.
 */
function resolveSourceNetG(
  client: DbClient,
  sourceType: GatePassSourceType | null,
  sourceId: number | null,
): number | null {
  if (!sourceType || sourceId == null) return null;

  if (sourceType === "SALE") {
    const rows = client
      .select({ quantityKg: saleItems.quantityKg })
      .from(saleItems)
      .where(eq(saleItems.saleId, sourceId))
      .all();
    const totalG = rows.reduce((sum, row) => sum + kgToG(row.quantityKg), 0);
    return totalG > 0 ? totalG : null;
  }

  if (sourceType === "PURCHASE") {
    const [row] = client
      .select({ totalNet: purchases.totalNetWeightKg })
      .from(purchases)
      .where(eq(purchases.id, sourceId))
      .all();
    const totalG = row ? kgToG(row.totalNet) : 0;
    return totalG > 0 ? totalG : null;
  }

  return null;
}

function buildGatePassDetail(client: DbClient, id: number): GatePassDetail | undefined {
  const [pass] = client.select().from(gatePasses).where(eq(gatePasses.id, id)).all();
  if (!pass) return undefined;

  const itemRows = client
    .select()
    .from(gatePassItems)
    .where(eq(gatePassItems.gatePassId, id))
    .orderBy(gatePassItems.id)
    .all();

  const productIds = Array.from(new Set(itemRows.map((item) => item.productId)));
  const productRows = productIds.length
    ? client
        .select({ id: products.id, name: products.name, nameUrdu: products.nameUrdu })
        .from(products)
        .where(inArray(products.id, productIds))
        .all()
    : [];
  const productMap = new Map(productRows.map((row) => [row.id, row]));

  const party = pass.partyId != null
    ? client.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, pass.partyId)).all()[0]
    : undefined;

  const items: GatePassItemView[] = itemRows.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: productMap.get(item.productId)?.name ?? null,
    productNameUrdu: productMap.get(item.productId)?.nameUrdu ?? null,
    bags: item.bags,
    weightG: item.weightG,
    weightKg: gToKg(item.weightG),
    saleItemId: item.saleItemId,
    purchaseItemId: item.purchaseItemId,
  }));

  const totalBags = items.reduce((sum, item) => sum + item.bags, 0);
  const totalWeightG = items.reduce((sum, item) => sum + item.weightG, 0);

  const referenceNetG = resolveSourceNetG(client, pass.sourceType, pass.sourceId);
  const mismatch = weighbridgeMismatch(pass.netG, referenceNetG);

  return {
    ...pass,
    items,
    totalBags,
    totalWeightG,
    totalWeightKg: gToKg(totalWeightG),
    partyName: party?.name ?? null,
    linkedDocument: resolveLinkedDocument(client, pass.sourceType, pass.sourceId),
    weighbridgeWarning: mismatch
      ? `Weighbridge net ${gToKg(pass.netG)} kg differs from the linked document net ` +
        `${gToKg(referenceNetG)} kg by more than 0.5%.`
      : null,
  };
}

function enrichListRows(rows: GatePass[]): GatePassListRow[] {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const itemRows = db
    .select({ gatePassId: gatePassItems.gatePassId, bags: gatePassItems.bags, weightG: gatePassItems.weightG })
    .from(gatePassItems)
    .where(inArray(gatePassItems.gatePassId, ids))
    .all();

  const totals = new Map<number, { bags: number; weightG: number; itemCount: number }>();
  for (const item of itemRows) {
    const prev = totals.get(item.gatePassId) ?? { bags: 0, weightG: 0, itemCount: 0 };
    prev.bags += item.bags;
    prev.weightG += item.weightG;
    prev.itemCount += 1;
    totals.set(item.gatePassId, prev);
  }

  const partyIds = Array.from(
    new Set(rows.map((row) => row.partyId).filter((value): value is number => value != null)),
  );
  const partyRows = partyIds.length
    ? db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(inArray(accounts.id, partyIds)).all()
    : [];
  const partyMap = new Map(partyRows.map((row) => [row.id, row.name]));

  return rows.map((row) => {
    const total = totals.get(row.id) ?? { bags: 0, weightG: 0, itemCount: 0 };
    return {
      id: row.id,
      number: row.number,
      direction: row.direction,
      status: row.status,
      issuedAt: row.issuedAt,
      completedAt: row.completedAt,
      vehicleNo: row.vehicleNo,
      driverName: row.driverName,
      partyId: row.partyId,
      partyName: row.partyId != null ? partyMap.get(row.partyId) ?? null : null,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      netG: row.netG,
      totalBags: total.bags,
      totalWeightG: total.weightG,
      itemCount: total.itemCount,
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getGatePasses(filters: GatePassListFilters = {}): Promise<GatePassListRow[]> {
  const conditions = [];
  if (filters.from) conditions.push(gte(gatePasses.issuedAt, toValidDate(filters.from)));
  if (filters.to) conditions.push(lte(gatePasses.issuedAt, endOfDay(filters.to)));
  if (filters.direction) conditions.push(eq(gatePasses.direction, filters.direction));
  if (filters.status) conditions.push(eq(gatePasses.status, filters.status));
  if (filters.partyId) conditions.push(eq(gatePasses.partyId, filters.partyId));
  if (filters.vehicleNo) {
    const needle = `%${filters.vehicleNo.toLowerCase()}%`;
    conditions.push(sql`LOWER(${gatePasses.vehicleNo}) LIKE ${needle}`);
  }

  const rows = db
    .select()
    .from(gatePasses)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(gatePasses.issuedAt), desc(gatePasses.id))
    .all();

  return enrichListRows(rows);
}

export async function getGatePass(id: number): Promise<GatePassDetail | undefined> {
  return buildGatePassDetail(db, id);
}

export async function getGatePassesForSource(
  sourceType: GatePassSourceType,
  sourceId: number,
): Promise<GatePassListRow[]> {
  const rows = db
    .select()
    .from(gatePasses)
    .where(and(eq(gatePasses.sourceType, sourceType), eq(gatePasses.sourceId, sourceId)))
    .orderBy(desc(gatePasses.issuedAt), desc(gatePasses.id))
    .all();
  return enrichListRows(rows);
}

/**
 * Looks up gate passes for many source documents at once, so a list screen can
 * show each row's linked pass numbers without a query per row.
 */
export async function getGatePassRefsForSources(
  sourceType: GatePassSourceType,
  sourceIds: number[],
): Promise<Map<number, LinkedGatePassRef[]>> {
  const map = new Map<number, LinkedGatePassRef[]>();
  if (sourceIds.length === 0) return map;

  const rows = db
    .select({
      id: gatePasses.id,
      number: gatePasses.number,
      status: gatePasses.status,
      direction: gatePasses.direction,
      sourceId: gatePasses.sourceId,
    })
    .from(gatePasses)
    .where(and(eq(gatePasses.sourceType, sourceType), inArray(gatePasses.sourceId, sourceIds)))
    .orderBy(desc(gatePasses.issuedAt), desc(gatePasses.id))
    .all();

  for (const row of rows) {
    if (row.sourceId == null) continue;
    const list = map.get(row.sourceId) ?? [];
    list.push({ id: row.id, number: row.number, status: row.status, direction: row.direction });
    map.set(row.sourceId, list);
  }
  return map;
}

export async function createGatePass(
  input: GatePassCreateInput,
  performedBy?: number,
): Promise<GatePassDetail> {
  const items = input.items ?? [];

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const issuedAt = toValidDate(input.issuedAt ?? undefined);
    assertPostingAllowed(client, issuedAt, "gate pass");

    for (const item of items) {
      if (!productExists(client, item.productId)) {
        throw new Error(`Invalid item: product #${item.productId} not found`);
      }
    }

    // Only OUT passes consume a document's dispatchable quantity; IN passes
    // are the arrival itself and have nothing to measure against yet.
    if (input.direction === "OUT" && input.sourceType && input.sourceId != null) {
      assertDispatchWithinSource(client, input.sourceType, input.sourceId, items);
    }

    const weights = resolveWeights(input);
    const fiscalYearId = resolveFiscalYearId(client, issuedAt);
    const prefix = `${input.direction === "IN" ? "GPI" : "GPO"}-${issuedAt.getFullYear()}-`;

    let created: GatePass | undefined;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const number = `${prefix}${String(nextNumberForPrefix(prefix)).padStart(5, "0")}`;
      try {
        created = tx
          .insert(gatePasses)
          .values({
            number,
            direction: input.direction,
            status: "ISSUED",
            issuedAt,
            completedAt: null,
            vehicleNo: input.vehicleNo ?? null,
            driverName: input.driverName ?? null,
            driverPhone: input.driverPhone ?? null,
            partyId: input.partyId ?? null,
            sourceType: input.sourceType ?? null,
            sourceId: input.sourceId ?? null,
            grossG: weights.grossG,
            tareG: weights.tareG,
            netG: weights.netG,
            remarks: input.remarks ?? null,
            createdBy: performedBy ?? null,
            cancelledReason: null,
            cancelledBy: null,
            cancelledAt: null,
            fiscalYearId,
            createdAt: issuedAt,
            updatedAt: issuedAt,
          })
          .returning()
          .get();
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 4) continue;
        throw error;
      }
    }
    if (!created) throw new Error("Could not allocate a gate pass number; please retry");

    for (const item of items) {
      tx.insert(gatePassItems)
        .values({
          gatePassId: created.id,
          productId: item.productId,
          bags: item.bags ?? 0,
          weightG: item.weightG ?? 0,
          saleItemId: item.saleItemId ?? null,
          purchaseItemId: item.purchaseItemId ?? null,
          createdAt: issuedAt,
        })
        .run();
    }

    writeGatePassAudit(client, created.id, "create", null, created, performedBy);

    return buildGatePassDetail(client, created.id)!;
  });
}

export async function completeGatePass(
  id: number,
  performedBy?: number,
): Promise<GatePassDetail | undefined> {
  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const [pass] = client.select().from(gatePasses).where(eq(gatePasses.id, id)).all();
    if (!pass) return undefined;
    if (pass.status === "CANCELLED") throw new Error("Cannot complete a cancelled gate pass");
    if (pass.status === "COMPLETED") throw new Error("Gate pass is already completed");

    const now = new Date();
    assertPostingAllowed(client, pass.issuedAt, "gate pass");

    client
      .update(gatePasses)
      .set({ status: "COMPLETED", completedAt: now, updatedAt: now })
      .where(eq(gatePasses.id, id))
      .run();
    writeGatePassAudit(client, id, "complete", { status: pass.status }, { status: "COMPLETED" }, performedBy);

    return buildGatePassDetail(client, id);
  });
}

export async function cancelGatePass(
  id: number,
  reason: string,
  performedBy?: number,
): Promise<GatePassDetail | undefined> {
  const trimmed = reason?.trim();
  if (!trimmed) throw new Error("A cancellation reason is required");

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const [pass] = client.select().from(gatePasses).where(eq(gatePasses.id, id)).all();
    if (!pass) return undefined;
    if (pass.status === "CANCELLED") throw new Error("Gate pass is already cancelled");

    const now = new Date();
    assertPostingAllowed(client, pass.issuedAt, "gate pass");

    client
      .update(gatePasses)
      .set({
        status: "CANCELLED",
        cancelledReason: trimmed,
        cancelledBy: performedBy ?? null,
        cancelledAt: now,
        updatedAt: now,
      })
      .where(eq(gatePasses.id, id))
      .run();
    writeGatePassAudit(
      client,
      id,
      "cancel",
      { status: pass.status },
      { status: "CANCELLED", reason: trimmed },
      performedBy,
    );

    return buildGatePassDetail(client, id);
  });
}

/**
 * Links an IN gate pass to the purchase that was raised from it.
 *
 * Called from `createPurchase` inside the same transaction, so the pass and the
 * purchase commit together. Only an unlinked IN pass may be attached, and only
 * one purchase may ever claim it.
 *
 * Deliberately synchronous: the transaction callback in `createPurchase` is
 * synchronous, so an async version called without `await` would turn a failed
 * link into an unhandled rejection and let the purchase commit anyway. A
 * synchronous throw propagates so the whole transaction rolls back.
 */
export function linkPurchaseToGatePass(
  client: DbClient,
  gatePassId: number,
  purchaseId: number,
  performedBy?: number,
): void {
  const [pass] = client.select().from(gatePasses).where(eq(gatePasses.id, gatePassId)).all();
  if (!pass) throw new Error("Gate pass not found");
  if (pass.direction !== "IN") throw new Error("Only an IN gate pass can be linked to a purchase");
  if (pass.status === "CANCELLED") throw new Error("Cannot link a cancelled gate pass");
  if (pass.sourceType === "PURCHASE" && pass.sourceId === purchaseId) return;
  if (pass.sourceId != null) {
    throw new Error(`Gate pass ${pass.number} is already linked to another document`);
  }

  client
    .update(gatePasses)
    .set({ sourceType: "PURCHASE", sourceId: purchaseId, updatedAt: new Date() })
    .where(eq(gatePasses.id, gatePassId))
    .run();
  writeGatePassAudit(client, gatePassId, "link_purchase", null, { purchaseId }, performedBy);
}

/**
 * Blocks deletion of a source document while any of its gate passes is still
 * live (issued or completed). A cancelled pass never blocks anything.
 */
export async function assertSourceHasNoActiveGatePass(
  sourceType: GatePassSourceType,
  sourceId: number,
): Promise<void> {
  const [row] = db
    .select({ number: gatePasses.number })
    .from(gatePasses)
    .where(
      and(
        eq(gatePasses.sourceType, sourceType),
        eq(gatePasses.sourceId, sourceId),
        ne(gatePasses.status, "CANCELLED"),
      ),
    )
    .limit(1)
    .all();
  if (row) {
    throw new Error(
      `Cannot delete this ${sourceType.toLowerCase()} while gate pass ${row.number} is still active. Cancel the gate pass first.`,
    );
  }
}

/**
 * Blocks a sale edit that would drop a product's ordered quantity below the
 * weight already dispatched for it on non-cancelled OUT passes.
 *
 * @param nextQuantityByProduct  productId -> ordered kilograms after the edit.
 */
export async function assertSaleReductionAllowed(
  client: DbClient,
  saleId: number,
  nextQuantityByProduct: Map<number, number>,
): Promise<void> {
  const dispatched = getDispatchedByProductG(client, "SALE", saleId);
  for (const [productId, total] of dispatched) {
    if (total.weightG <= 0) continue;
    const nextG = Math.round((nextQuantityByProduct.get(productId) ?? 0) * 1000);
    if (nextG + 1 < total.weightG) {
      throw new Error(
        `Cannot reduce sale quantity for ${productName(client, productId)} below the ` +
          `${gToKg(total.weightG)} kg already dispatched. Cancel the gate pass first.`,
      );
    }
  }
}

export async function getSaleDispatchSummary(
  saleId: number,
): Promise<SaleDispatchSummary | undefined> {
  const [sale] = db.select().from(sales).where(eq(sales.id, saleId)).all();
  if (!sale) return undefined;

  const orderedItems = db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
  const orderedByProduct = new Map<number, number>();
  const orderedBagsByProduct = new Map<number, number>();
  for (const item of orderedItems) {
    orderedByProduct.set(
      item.productId,
      (orderedByProduct.get(item.productId) ?? 0) + kgToG(item.quantityKg),
    );
    if ((item.unit ?? "").toLowerCase() === "bag") {
      orderedBagsByProduct.set(
        item.productId,
        (orderedBagsByProduct.get(item.productId) ?? 0) + Math.round(parseAmount(item.quantity)),
      );
    }
  }

  const dispatched = getDispatchedByProductG(db, "SALE", saleId);
  const productIds = Array.from(new Set([...orderedByProduct.keys(), ...dispatched.keys()]));
  const productRows = productIds.length
    ? db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds)).all()
    : [];
  const productMap = new Map(productRows.map((row) => [row.id, row.name]));

  const items: DispatchItemSummary[] = productIds.map((productId) => {
    const orderedG = orderedByProduct.get(productId) ?? 0;
    const dispatchedG = dispatched.get(productId)?.weightG ?? 0;
    const pendingG = Math.max(orderedG - dispatchedG, 0);
    const status: DispatchLineStatus =
      dispatchedG <= 0 ? "not_dispatched" : pendingG <= 1 ? "fully_dispatched" : "partly_dispatched";
    return {
      productId,
      productName: productMap.get(productId) ?? null,
      orderedKg: orderedG / 1000,
      dispatchedKg: dispatchedG / 1000,
      pendingKg: pendingG / 1000,
      orderedBags: orderedBagsByProduct.has(productId) ? orderedBagsByProduct.get(productId)! : null,
      dispatchedBags: dispatched.get(productId)?.bags ?? 0,
      status,
    };
  });

  const orderedG = Array.from(orderedByProduct.values()).reduce((sum, value) => sum + value, 0);
  const dispatchedG = Array.from(dispatched.values()).reduce((sum, value) => sum + value.weightG, 0);
  const pendingG = Math.max(orderedG - dispatchedG, 0);
  const status: DispatchLineStatus =
    dispatchedG <= 0 ? "not_dispatched" : pendingG <= 1 ? "fully_dispatched" : "partly_dispatched";

  const passes = enrichListRows(
    db
      .select()
      .from(gatePasses)
      .where(and(eq(gatePasses.sourceType, "SALE"), eq(gatePasses.sourceId, saleId)))
      .orderBy(desc(gatePasses.issuedAt), desc(gatePasses.id))
      .all(),
  );

  return {
    saleId,
    invoiceNumber: sale.invoiceNumber,
    status,
    orderedKg: orderedG / 1000,
    dispatchedKg: dispatchedG / 1000,
    pendingKg: pendingG / 1000,
    items,
    passes,
  };
}

/**
 * Batch dispatch roll-up for many sales, so the sale list can render its
 * dispatched/pending badges without a query per row.
 */
export async function getSaleDispatchProgress(
  saleIds: number[],
): Promise<Map<number, SaleDispatchProgress>> {
  const map = new Map<number, SaleDispatchProgress>();
  if (saleIds.length === 0) return map;

  const orderedRows = db
    .select({
      saleId: saleItems.saleId,
      quantityKg: saleItems.quantityKg,
      quantity: saleItems.quantity,
      unit: saleItems.unit,
    })
    .from(saleItems)
    .where(inArray(saleItems.saleId, saleIds))
    .all();
  const orderedG = new Map<number, number>();
  const orderedBags = new Map<number, number>();
  for (const row of orderedRows) {
    orderedG.set(row.saleId, (orderedG.get(row.saleId) ?? 0) + kgToG(row.quantityKg));
    if ((row.unit ?? "").toLowerCase() === "bag") {
      orderedBags.set(row.saleId, (orderedBags.get(row.saleId) ?? 0) + Math.round(parseAmount(row.quantity)));
    }
  }

  const dispatchedRows = db
    .select({
      saleId: gatePasses.sourceId,
      weightG: gatePassItems.weightG,
      bags: gatePassItems.bags,
    })
    .from(gatePassItems)
    .innerJoin(gatePasses, eq(gatePassItems.gatePassId, gatePasses.id))
    .where(
      and(
        eq(gatePasses.sourceType, "SALE"),
        eq(gatePasses.direction, "OUT"),
        ne(gatePasses.status, "CANCELLED"),
        inArray(gatePasses.sourceId, saleIds),
      ),
    )
    .all();
  const dispatchedG = new Map<number, number>();
  const dispatchedBags = new Map<number, number>();
  for (const row of dispatchedRows) {
    if (row.saleId == null) continue;
    dispatchedG.set(row.saleId, (dispatchedG.get(row.saleId) ?? 0) + row.weightG);
    dispatchedBags.set(row.saleId, (dispatchedBags.get(row.saleId) ?? 0) + row.bags);
  }

  for (const saleId of saleIds) {
    const totalG = orderedG.get(saleId) ?? 0;
    const shippedG = dispatchedG.get(saleId) ?? 0;
    const pendingG = Math.max(totalG - shippedG, 0);
    const status: DispatchLineStatus =
      shippedG <= 0 ? "not_dispatched" : pendingG <= 1 ? "fully_dispatched" : "partly_dispatched";
    map.set(saleId, {
      saleId,
      status,
      orderedKg: totalG / 1000,
      dispatchedKg: shippedG / 1000,
      pendingKg: pendingG / 1000,
      orderedBags: orderedBags.has(saleId) ? orderedBags.get(saleId)! : null,
      dispatchedBags: dispatchedBags.get(saleId) ?? 0,
    });
  }
  return map;
}

export async function getGatePassDashboard(): Promise<GatePassDashboard> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const staleCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const rows = await getGatePasses();

  const vehiclesInside = rows.filter((row) => row.direction === "IN" && row.status === "ISSUED").length;
  const dispatchedBagsToday = rows
    .filter(
      (row) => row.direction === "OUT" && row.status !== "CANCELLED" && row.issuedAt >= startOfToday,
    )
    .reduce((sum, row) => sum + row.totalBags, 0);
  const openPasses = rows.filter((row) => row.status === "ISSUED");
  const staleOpenPasses = openPasses.filter((row) => row.issuedAt < staleCutoff);

  return {
    vehiclesInside,
    dispatchedBagsToday,
    openPasses: openPasses.length,
    staleOpenPasses,
  };
}
