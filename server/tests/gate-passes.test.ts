/**
 * Gate Pass model integration tests.
 *
 * These exercise the model directly against a real (throwaway) SQLite file so
 * the numbering, dispatch caps, weighbridge arithmetic and delete guards are
 * verified against the actual SQL rather than mocks.
 *
 * The database module reads `DATABASE_URL` at import time, so it is set here,
 * at module scope, *before* any application module is imported. All application
 * modules are imported dynamically inside `beforeAll`, after the environment is
 * in place, so `models/db.ts` opens the test file instead of the app database.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";

const testDir = path.resolve(process.cwd(), ".test-data");
const testDbPath = path.join(testDir, "gate-passes.test.db");
process.env.DATABASE_URL = testDbPath;

type DbClient = typeof import("../models/db").db;
type Schema = typeof import("../db/schema");
type GatePassModel = typeof import("../models/gate-passes.model");
type PurchasesModel = typeof import("../models/purchases.model");
type SalesModel = typeof import("../models/sales.model");
type PurchaseItemInput = import("../repositories/types").PurchaseItemInput;

let db!: DbClient;
let schema!: Schema;
let gatePasses!: GatePassModel;
let purchasesModel!: PurchasesModel;
let salesModel!: SalesModel;

// Base rows created once; transactional rows are cleared before every test.
let supplierId!: number;
let customerId!: number;
let productId!: number;
let userId!: number;
let saleSeq = 0;

/** A fixed in-year date so numbering prefixes are predictable. */
const baseDate = new Date(2026, 0, 15, 9, 0, 0);

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDbPath + suffix, { force: true });
  fs.mkdirSync(testDir, { recursive: true });

  const dbModule = await import("../models/db");
  db = dbModule.db;
  schema = await import("../db/schema");

  const { ensureSchema } = await import("../utils/ensure-schema");
  ensureSchema();

  gatePasses = await import("../models/gate-passes.model");
  purchasesModel = await import("../models/purchases.model");
  salesModel = await import("../models/sales.model");

  supplierId = db
    .insert(schema.accounts)
    .values({ name: "Test Supplier", type: "supplier" })
    .returning()
    .get().id;
  customerId = db
    .insert(schema.accounts)
    .values({ name: "Test Customer", type: "customer" })
    .returning()
    .get().id;
  productId = db
    .insert(schema.products)
    .values({ name: "Test Rice", unit: "kg", currentStock: "1000000" })
    .returning()
    .get().id;
  userId = db
    .insert(schema.users)
    .values({ username: "tester", password: "x", fullName: "Test User", role: "admin" })
    .returning()
    .get().id;
  db.insert(schema.fiscalYears)
    .values({
      name: "FY-2026",
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      status: "open",
    })
    .run();
});

beforeEach(() => {
  db.delete(schema.gatePassItems).run();
  db.delete(schema.gatePasses).run();
  db.delete(schema.ledgerEntries).run();
  db.delete(schema.taxLedgers).run();
  db.delete(schema.cashTransactions).run();
  db.delete(schema.saleItems).run();
  db.delete(schema.sales).run();
  db.delete(schema.purchaseItems).run();
  db.delete(schema.purchaseCharges).run();
  db.delete(schema.purchases).run();
  db.delete(schema.periodLocks).run();
  db.delete(schema.processingOutputs).run();
  db.delete(schema.processing).run();
  db.delete(schema.auditLogs).run();

  // Restore stock/balances that a previous test's posting may have moved.
  db.update(schema.products).set({ currentStock: "1000000", avgPurchasePrice: "0" }).run();
  db.update(schema.accounts).set({ currentBalance: "0" }).run();
});

afterAll(() => {
  db.$client.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Inserts a sale with a single kg line directly, bypassing posting. */
function seedSale(quantityKg: string): { saleId: number; itemId: number } {
  saleSeq += 1;
  const sale = db
    .insert(schema.sales)
    .values({
      invoiceNumber: `SAL-TEST-${saleSeq}`,
      customerId,
      paidAmount: "0",
      saleDate: baseDate,
    })
    .returning()
    .get();
  const item = db
    .insert(schema.saleItems)
    .values({
      saleId: sale.id,
      productId,
      quantity: quantityKg,
      quantityKg,
      unit: "kg",
      pricePerUnit: "1",
      totalPrice: "0",
    })
    .returning()
    .get();
  return { saleId: sale.id, itemId: item.id };
}

function outPassInput(sourceId: number, weightG: number, bags = 0) {
  return {
    direction: "OUT" as const,
    sourceType: "SALE" as const,
    sourceId,
    issuedAt: baseDate,
    items: [{ productId, bags, weightG }],
  };
}

function purchaseItemInput(): PurchaseItemInput {
  return {
    productId,
    bags: "10",
    fillingPerBagKg: "50",
    looseKgs: "0",
    rateUnit: "kg",
    rate: "100",
  };
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

describe("numbering", () => {
  it("allocates sequential, unique numbers per year and direction", async () => {
    const ins = await Promise.all(
      Array.from({ length: 12 }, () =>
        gatePasses.createGatePass({ direction: "IN", issuedAt: baseDate, items: [] }),
      ),
    );
    const outs = await Promise.all(
      Array.from({ length: 12 }, () =>
        gatePasses.createGatePass({ direction: "OUT", issuedAt: baseDate, items: [] }),
      ),
    );

    const inNumbers = ins.map((p) => p.number);
    const outNumbers = outs.map((p) => p.number);

    expect(inNumbers).toEqual(
      Array.from({ length: 12 }, (_, i) => `GPI-2026-${String(i + 1).padStart(5, "0")}`),
    );
    expect(outNumbers).toEqual(
      Array.from({ length: 12 }, (_, i) => `GPO-2026-${String(i + 1).padStart(5, "0")}`),
    );
    // Independent sequences: no duplicates across either direction.
    expect(new Set([...inNumbers, ...outNumbers]).size).toBe(24);
  });

  it("continues from the highest existing number for its prefix", async () => {
    db.insert(schema.gatePasses)
      .values({ number: "GPI-2026-00050", direction: "IN", status: "ISSUED", issuedAt: baseDate })
      .run();

    const next = await gatePasses.createGatePass({ direction: "IN", issuedAt: baseDate, items: [] });
    expect(next.number).toBe("GPI-2026-00051");

    // A different direction is unaffected by the IN row above.
    const out = await gatePasses.createGatePass({ direction: "OUT", issuedAt: baseDate, items: [] });
    expect(out.number).toBe("GPO-2026-00001");
  });
});

// ---------------------------------------------------------------------------
// Dispatch caps
// ---------------------------------------------------------------------------

describe("dispatch caps", () => {
  it("rejects an OUT pass that would exceed the sale quantity", async () => {
    const { saleId } = seedSale("1000");
    await gatePasses.createGatePass(outPassInput(saleId, 1_000_000, 20));

    // The whole quantity is already dispatched; a further 1 kg is clearly over
    // (1 g over would sit inside the rounding tolerance tested separately).
    await expect(gatePasses.createGatePass(outPassInput(saleId, 1_000, 1))).rejects.toThrow(
      /cannot exceed/,
    );
  });

  it("accepts a partial dispatch split across several passes", async () => {
    const { saleId } = seedSale("1000");
    await gatePasses.createGatePass(outPassInput(saleId, 400_000, 8));

    let summary = await gatePasses.getSaleDispatchSummary(saleId);
    expect(summary?.status).toBe("partly_dispatched");
    expect(summary?.dispatchedKg).toBeCloseTo(400, 5);
    expect(summary?.pendingKg).toBeCloseTo(600, 5);

    await gatePasses.createGatePass(outPassInput(saleId, 600_000, 12));

    summary = await gatePasses.getSaleDispatchSummary(saleId);
    expect(summary?.status).toBe("fully_dispatched");
    expect(summary?.dispatchedKg).toBeCloseTo(1000, 5);
    expect(summary?.pendingKg).toBe(0);
  });

  it("frees quantity again when a pass is cancelled", async () => {
    const { saleId } = seedSale("1000");
    const first = await gatePasses.createGatePass(outPassInput(saleId, 600_000, 12));

    await expect(gatePasses.createGatePass(outPassInput(saleId, 500_000, 10))).rejects.toThrow(
      /cannot exceed/,
    );

    await gatePasses.cancelGatePass(first.id, "wrong vehicle", userId);

    // The cancelled pass no longer counts, so the space is available again.
    const second = await gatePasses.createGatePass(outPassInput(saleId, 500_000, 10));
    expect(second.status).toBe("ISSUED");

    const summary = await gatePasses.getSaleDispatchSummary(saleId);
    expect(summary?.status).toBe("partly_dispatched");
    expect(summary?.dispatchedKg).toBeCloseTo(500, 5);
  });

  it("cancelling requires a reason", async () => {
    const pass = await gatePasses.createGatePass({ direction: "IN", issuedAt: baseDate, items: [] });
    await expect(gatePasses.cancelGatePass(pass.id, "   ")).rejects.toThrow(/reason is required/);
  });

  it("allows a full-quantity dispatch right on the rounding boundary", async () => {
    const { saleId } = seedSale("1000.001");
    // 1,000,001 g ordered; dispatch the full 1,000,001 g.
    const pass = await gatePasses.createGatePass(outPassInput(saleId, 1_000_001, 20));
    expect(pass.status).toBe("ISSUED");
  });
});

// ---------------------------------------------------------------------------
// Weighbridge
// ---------------------------------------------------------------------------

describe("weighbridge", () => {
  it("computes net from gross and tare when net is omitted", async () => {
    const pass = await gatePasses.createGatePass({
      direction: "IN",
      issuedAt: baseDate,
      grossG: 1_000_000,
      tareG: 200_000,
      items: [],
    });
    expect(pass.netG).toBe(800_000);
  });

  it("rejects an explicit net that disagrees with gross minus tare", async () => {
    await expect(
      gatePasses.createGatePass({
        direction: "IN",
        issuedAt: baseDate,
        grossG: 1000,
        tareG: 200,
        netG: 900,
        items: [],
      }),
    ).rejects.toThrow(/must equal/);
  });

  it("rejects tare heavier than gross", async () => {
    await expect(
      gatePasses.createGatePass({
        direction: "IN",
        issuedAt: baseDate,
        grossG: 100,
        tareG: 200,
        items: [],
      }),
    ).rejects.toThrow(/Tare weight cannot exceed gross weight/);
  });

  it("compares a pass net against the linked document net (>0.5% warns)", async () => {
    // Exactly on tolerance (0.4%) -> no warning.
    const within = await gatePasses.createGatePass({
      ...outPassInput(seedSale("1000").saleId, 1_000_000, 20),
      grossG: 1_100_000,
      tareG: 102_000,
      // net = 998,000 g vs 1,000,000 g reference -> 0.2%
    });
    expect(within.weighbridgeWarning).toBeNull();

    // Past tolerance (10%) -> warning.
    const over = await gatePasses.createGatePass({
      ...outPassInput(seedSale("1000").saleId, 1_000_000, 20),
      grossG: 1_000_000,
      tareG: 100_000,
      // net = 900,000 g vs 1,000,000 g reference -> 10%
    });
    expect(over.weighbridgeWarning).toMatch(/0\.5%/);
  });

  it("weighbridgeMismatch only trips past the threshold", () => {
    expect(gatePasses.weighbridgeMismatch(1_000_000, 1_000_000)).toBeNull();
    expect(gatePasses.weighbridgeMismatch(1_000_000, 1_005_000)).toBeNull(); // 0.4975%
    expect(gatePasses.weighbridgeMismatch(1_000_000, 1_006_000)).toMatchObject({
      diffG: 6000,
    });
    expect(gatePasses.weighbridgeMismatch(null, 1_000_000)).toBeNull();
    expect(gatePasses.weighbridgeMismatch(1_000_000, null)).toBeNull();
    expect(gatePasses.weighbridgeMismatch(1_000_000, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe("lifecycle", () => {
  it("cannot be completed twice and can be cancelled afterwards", async () => {
    const pass = await gatePasses.createGatePass({ direction: "IN", issuedAt: baseDate, items: [] });

    const completed = await gatePasses.completeGatePass(pass.id, userId);
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.completedAt).toBeInstanceOf(Date);

    await expect(gatePasses.completeGatePass(pass.id)).rejects.toThrow(/already completed/);

    // A completed pass is not editable, but it can still be cancelled (with a
    // reason) — the audit trail keeps the completed step.
    const cancelled = await gatePasses.cancelGatePass(pass.id, "vehicle returned", userId);
    expect(cancelled?.status).toBe("CANCELLED");
    expect(cancelled?.cancelledReason).toBe("vehicle returned");

    await expect(gatePasses.cancelGatePass(pass.id, "again")).rejects.toThrow(/already cancelled/);
    await expect(gatePasses.completeGatePass(pass.id)).rejects.toThrow(/cancelled/);
  });

  it("blocks create, complete and cancel inside a locked period", async () => {
    const lockedDay = new Date(2026, 2, 10, 12, 0, 0);
    const pass = await gatePasses.createGatePass({
      direction: "IN",
      issuedAt: lockedDay,
      items: [],
    });

    db.insert(schema.periodLocks)
      .values({
        fromDate: new Date(2026, 2, 1),
        toDate: new Date(2026, 2, 28),
        reason: "books closed",
      })
      .run();

    await expect(
      gatePasses.createGatePass({ direction: "IN", issuedAt: lockedDay, items: [] }),
    ).rejects.toThrow(/locked/);
    await expect(gatePasses.completeGatePass(pass.id)).rejects.toThrow(/locked/);
    await expect(gatePasses.cancelGatePass(pass.id, "x")).rejects.toThrow(/locked/);
  });

  it("writes an audit log entry for create, complete and cancel", async () => {
    const pass = await gatePasses.createGatePass({ direction: "IN", issuedAt: baseDate, items: [] });
    await gatePasses.completeGatePass(pass.id, userId);
    await gatePasses.cancelGatePass(pass.id, "test", userId);

    const rows = db.select().from(schema.auditLogs).all();
    const actions = rows.filter((row) => row.entity === "gate_pass").map((row) => row.action);
    expect(actions).toContain("create");
    expect(actions).toContain("complete");
    expect(actions).toContain("cancel");
  });
});

// ---------------------------------------------------------------------------
// Purchase linkage (IN pass -> purchase)
// ---------------------------------------------------------------------------

describe("purchase linkage", () => {
  it("links the purchase raised from an IN pass and resolves the document", async () => {
    const inPass = await gatePasses.createGatePass({
      direction: "IN",
      issuedAt: baseDate,
      partyId: supplierId,
      vehicleNo: "LEB-1234",
      items: [{ productId, bags: 10, weightG: 500_000 }],
    });

    const purchase = await purchasesModel.createPurchase(
      { supplierId, paidAmount: "0", purchaseDate: baseDate },
      [purchaseItemInput()],
      [],
      40,
      { gatePassId: inPass.id, performedBy: userId },
    );

    const linked = await gatePasses.getGatePass(inPass.id);
    expect(linked?.sourceType).toBe("PURCHASE");
    expect(linked?.sourceId).toBe(purchase.id);
    expect(linked?.linkedDocument?.number).toBe(purchase.invoiceNumber);
    expect(linked?.linkedDocument?.type).toBe("PURCHASE");
  });

  it("refuses to link a pass that is already claimed", async () => {
    const inPass = await gatePasses.createGatePass({
      direction: "IN",
      issuedAt: baseDate,
      items: [{ productId, bags: 10, weightG: 500_000 }],
    });
    await purchasesModel.createPurchase(
      { supplierId, paidAmount: "0", purchaseDate: baseDate },
      [purchaseItemInput()],
      [],
      40,
      { gatePassId: inPass.id },
    );

    await expect(
      purchasesModel.createPurchase(
        { supplierId, paidAmount: "0", purchaseDate: baseDate },
        [purchaseItemInput()],
        [],
        40,
        { gatePassId: inPass.id },
      ),
    ).rejects.toThrow(/already linked/);
  });

  it("only links IN passes", async () => {
    const outPass = await gatePasses.createGatePass({
      direction: "OUT",
      issuedAt: baseDate,
      items: [],
    });

    await expect(
      purchasesModel.createPurchase(
        { supplierId, paidAmount: "0", purchaseDate: baseDate },
        [purchaseItemInput()],
        [],
        40,
        { gatePassId: outPass.id },
      ),
    ).rejects.toThrow(/Only an IN gate pass/);
  });

  it("rejects linking an unknown pass", () => {
    expect(() => gatePasses.linkPurchaseToGatePass(db, 999_999, 1)).toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// Source-document delete / edit guards
// ---------------------------------------------------------------------------

describe("source guards", () => {
  it("blocks deleting a sale while it has a live pass, then allows it once cancelled", async () => {
    const { saleId } = seedSale("100");
    const pass = await gatePasses.createGatePass(outPassInput(saleId, 100_000, 2));

    await expect(salesModel.deleteSale(saleId)).rejects.toThrow(/Cannot delete/);

    await gatePasses.cancelGatePass(pass.id, "wrong vehicle", userId);
    await expect(salesModel.deleteSale(saleId)).resolves.toBe(true);
  });

  it("blocks deleting a purchase while it has a live pass", async () => {
    const purchase = await purchasesModel.createPurchase(
      { supplierId, paidAmount: "0", purchaseDate: baseDate },
      [purchaseItemInput()],
      [],
      40,
    );
    await gatePasses.createGatePass({
      direction: "IN",
      issuedAt: baseDate,
      sourceType: "PURCHASE",
      sourceId: purchase.id,
      items: [{ productId, bags: 10, weightG: 500_000 }],
    });

    await expect(purchasesModel.deletePurchase(purchase.id)).rejects.toThrow(/Cannot delete/);
  });

  it("blocks reducing a sale line below the dispatched weight", async () => {
    const { saleId } = seedSale("1000");
    await gatePasses.createGatePass(outPassInput(saleId, 800_000, 16));

    await expect(
      gatePasses.assertSaleReductionAllowed(db, saleId, new Map([[productId, 500]])),
    ).rejects.toThrow(/Cannot reduce/);

    await expect(
      gatePasses.assertSaleReductionAllowed(db, saleId, new Map([[productId, 1000]])),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Listing + dashboard
// ---------------------------------------------------------------------------

describe("listing and dashboard", () => {
  it("filters by direction and vehicle and reports open passes", async () => {
    const inOne = await gatePasses.createGatePass({
      direction: "IN",
      issuedAt: baseDate,
      vehicleNo: "LEB-1234",
      items: [{ productId, bags: 5, weightG: 100_000 }],
    });
    await gatePasses.createGatePass({
      direction: "IN",
      issuedAt: baseDate,
      vehicleNo: "ABC-9999",
      items: [{ productId, bags: 5, weightG: 100_000 }],
    });
    await gatePasses.createGatePass({ direction: "OUT", issuedAt: baseDate, items: [] });

    const ins = await gatePasses.getGatePasses({ direction: "IN" });
    expect(ins).toHaveLength(2);

    const byVehicle = await gatePasses.getGatePasses({ vehicleNo: "leb-12" });
    expect(byVehicle).toHaveLength(1);
    expect(byVehicle[0].number).toBe(inOne.number);

    const dashboard = await gatePasses.getGatePassDashboard();
    expect(dashboard.vehiclesInside).toBe(2);
    expect(dashboard.openPasses).toBe(3);

    await gatePasses.completeGatePass(inOne.id);
    const after = await gatePasses.getGatePassDashboard();
    expect(after.vehiclesInside).toBe(1);
    expect(after.openPasses).toBe(2);
  });

  it("flags open passes older than 24 hours as stale", async () => {
    await gatePasses.createGatePass({
      direction: "IN",
      issuedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      items: [],
    });

    const dashboard = await gatePasses.getGatePassDashboard();
    expect(dashboard.staleOpenPasses.length).toBeGreaterThanOrEqual(1);
  });
});
