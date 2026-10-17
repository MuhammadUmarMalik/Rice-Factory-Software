/**
 * A sale can go to a customer, supplier or employee account. The sale must
 * post to that party's own ledger, move cleanly when edited to another party,
 * reverse on delete, and reject a party whose account type does not match.
 * Bootstraps a throwaway DB the same way gate-passes.test.ts does.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const testDir = path.resolve(process.cwd(), ".test-data");
const testDbPath = path.join(testDir, "sale-party-types.test.db");
process.env.DATABASE_URL = testDbPath;

let db!: typeof import("../models/db").db;
let schema!: typeof import("../db/schema");
let controller!: typeof import("../controllers/sales.controller");
let ledgerModel!: typeof import("../models/ledger.model");
const ids: Record<"customer" | "supplier" | "employee", number> = { customer: 0, supplier: 0, employee: 0 };
let productId!: number;

function call(fn: (req: any, res: any) => Promise<unknown>, req: any) {
  let status = 200;
  let payload: any;
  const res: any = {
    status(code: number) { status = code; return res; },
    json(value: unknown) { payload = value; return res; },
    send() { return res; },
  };
  return fn(req, res).then(() => ({ status, payload }));
}

const saleBody = (partyType: string, partyId: number, price = "100") => ({
  partyType,
  partyId,
  vehicleNumber: "LEA-1234",
  saleDate: "2026-01-15",
  paymentMode: "credit",
  paidAmount: "0",
  items: [{ productId, quantity: "10", unit: "kg", pricePerUnit: price }],
});

/** Net debit of every posted line on the account, plus the ledger report's closing balance. */
async function balanceOf(accountId: number) {
  const rows = db.select().from(schema.ledgerEntries).all().filter((e) => e.accountId === accountId);
  const net = rows.reduce((sum, e) => sum + (e.transactionType === "debit" ? 1 : -1) * Number(e.amount), 0);
  const report = await ledgerModel.getLedgerReport({ accountId });
  const lastRunning = report.rows.length ? Number(report.rows[report.rows.length - 1].runningBalance) : 0;
  return { net, rows: report.rows, closing: Number(report.totals.closingBalance), lastRunning };
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDbPath + suffix, { force: true });
  fs.mkdirSync(testDir, { recursive: true });
  db = (await import("../models/db")).db;
  schema = await import("../db/schema");
  (await import("../utils/ensure-schema")).ensureSchema();
  controller = await import("../controllers/sales.controller");
  ledgerModel = await import("../models/ledger.model");

  for (const type of ["customer", "supplier", "employee"] as const) {
    ids[type] = db.insert(schema.accounts).values({ name: `Test ${type}`, type }).returning().get().id;
  }
  productId = db
    .insert(schema.products)
    .values({ name: "Head Rice", unit: "kg", productType: "bio", currentStock: "100000" })
    .returning()
    .get().id;
  db.insert(schema.fiscalYears)
    .values({ name: "FY-2026", startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31), status: "open" })
    .run();
});

describe("sale party types", () => {
  for (const type of ["customer", "supplier", "employee"] as const) {
    it(`posts, edits and reverses a ${type} sale on the ${type}'s own ledger`, async () => {
      const created = await call(controller.createSale, { body: saleBody(type, ids[type]) });
      expect(created.status).toBe(201);
      expect(created.payload.partyType).toBe(type);
      expect(created.payload.customerId).toBe(ids[type]);

      // Sale amount is debited to the party (receivable / reduces a supplier payable).
      let bal = await balanceOf(ids[type]);
      expect(bal.net).toBe(1000);
      expect(bal.lastRunning).toBe(bal.closing);
      expect(created.payload.notes).toMatch(/Vehicle LEA-1234/);
      expect(bal.rows.some((r) => /Vehicle LEA-1234/.test(r.narration))).toBe(true);
      // Stored narration already names the vehicle; the ledger must not add it twice.
      expect(bal.rows.every((r) => (r.narration.match(/LEA-1234/g) || []).length <= 1)).toBe(true);

      const fetched = await call(controller.getSale, { params: { id: String(created.payload.id) } });
      expect(fetched.payload.partyName).toBe(`Test ${type}`);

      const updated = await call(controller.updateSale, {
        params: { id: String(created.payload.id) },
        body: saleBody(type, ids[type], "150"),
      });
      expect(updated.status).toBe(200);
      bal = await balanceOf(ids[type]);
      expect(bal.net).toBe(1500);
      expect(bal.lastRunning).toBe(bal.closing);

      const deleted = await call(controller.deleteSale, { params: { id: String(created.payload.id) } });
      expect(deleted.status).toBe(204);
      bal = await balanceOf(ids[type]);
      expect(bal.net).toBe(0);
    });
  }

  it("moves the ledger lines when a sale is re-assigned to another party type", async () => {
    const created = await call(controller.createSale, { body: saleBody("customer", ids.customer) });
    await call(controller.updateSale, {
      params: { id: String(created.payload.id) },
      body: saleBody("employee", ids.employee),
    });
    expect((await balanceOf(ids.customer)).net).toBe(0);
    expect((await balanceOf(ids.employee)).net).toBe(1000);
    await call(controller.deleteSale, { params: { id: String(created.payload.id) } });
  });

  it("rejects a party whose account is not of the chosen type", async () => {
    const res = await call(controller.createSale, { body: saleBody("employee", ids.supplier) });
    expect(res.status).toBe(400);
    expect(res.payload.error).toMatch(/employee was not found/);
  });

  it("treats a sale without partyType as a customer sale (old clients)", async () => {
    const { partyType, partyId, ...legacy } = saleBody("customer", ids.customer);
    const res = await call(controller.createSale, { body: { ...legacy, customerId: ids.customer } });
    expect(res.status).toBe(201);
    expect(res.payload.partyType).toBe("customer");
    await call(controller.deleteSale, { params: { id: String(res.payload.id) } });
  });
});
