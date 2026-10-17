import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const testDir = path.resolve(process.cwd(), ".test-data");
const testDbPath = path.join(testDir, "cheques.test.db");
process.env.DATABASE_URL = testDbPath;

let c!: typeof import("../controllers/cheques.controller");

function call(handler: (req: any, res: any) => unknown, req: Record<string, unknown>) {
  let status = 200;
  let payload: any;
  const res: any = {
    status(code: number) {
      status = code;
      return res;
    },
    json(v: unknown) {
      payload = v;
      return res;
    },
    send() {
      return res;
    },
  };
  handler({ params: {}, query: {}, ...req }, res);
  return { status, payload };
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDbPath + suffix, { force: true });
  fs.mkdirSync(testDir, { recursive: true });
  (await import("../utils/ensure-schema")).ensureSchema();
  c = await import("../controllers/cheques.controller");
});

describe("cheque register", () => {
  it("validates, walks allowed transitions, and blocks the rest", () => {
    expect(call(c.createCheque, { body: { direction: "received", chequeNo: "", amount: 5, chequeDate: "2026-10-20" } }).status).toBe(400);

    const created = call(c.createCheque, {
      body: { direction: "received", chequeNo: "001234", bankName: "HBL", amount: "250000", chequeDate: "2026-10-20" },
    });
    expect(created.status).toBe(201);
    const id = created.payload.id;
    expect(created.payload).toMatchObject({ status: "pending", amount: "250000" });

    expect(call(c.updateChequeStatus, { params: { id: String(id) }, body: { status: "deposited" } }).payload.status).toBe("deposited");
    // deposited -> pending is not allowed
    expect(call(c.updateChequeStatus, { params: { id: String(id) }, body: { status: "pending" } }).status).toBe(400);
    expect(call(c.updateChequeStatus, { params: { id: String(id) }, body: { status: "cleared" } }).payload.status).toBe("cleared");
    // cleared is final and cannot be deleted
    expect(call(c.updateChequeStatus, { params: { id: String(id) }, body: { status: "bounced" } }).status).toBe(400);
    expect(call(c.deleteCheque, { params: { id: String(id) } }).status).toBe(400);

    expect(call(c.listCheques, { query: { status: "cleared" } }).payload).toHaveLength(1);
  });
});
