/**
 * First-run onboarding: /api/auth/bootstrap creates the admin plus mill
 * settings, the opening fiscal year and opening cash, exactly once.
 * Bootstraps a throwaway DB the same way gate-passes.test.ts does.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const testDir = path.resolve(process.cwd(), ".test-data");
const testDbPath = path.join(testDir, "onboarding.test.db");
process.env.DATABASE_URL = testDbPath;
process.env.APP_DATA_DIR = path.join(testDir, "onboarding");

let auth!: typeof import("../controllers/auth.controller");

function call(handler: (req: any, res: any, next: any) => unknown, body?: unknown) {
  return new Promise<{ status: number; payload: any }>((resolve, reject) => {
    let status = 200;
    const res: any = {
      status(code: number) {
        status = code;
        return res;
      },
      json(payload: unknown) {
        resolve({ status, payload });
        return res;
      },
    };
    handler({ body }, res, reject);
  });
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDbPath + suffix, { force: true });
  fs.rmSync(process.env.APP_DATA_DIR!, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });
  const { ensureSchema } = await import("../utils/ensure-schema");
  ensureSchema();
  auth = await import("../controllers/auth.controller");
});

describe("onboarding", () => {
  it("sets up the mill once, then locks", async () => {
    expect((await call(auth.setupStatus)).payload.needsSetup).toBe(true);

    const body = {
      fullName: "Owner",
      username: "owner",
      password: "secret-pass",
      mill: { businessName: "Test Rice Mill", phone: "042-111", language: "ur", theme: "dark" },
      fiscalYear: { name: "FY 2026-27", startDate: "2026-07-01", endDate: "2027-06-30" },
      openingCash: 50000,
    };
    const created = await call(auth.bootstrapAdmin, body);
    expect(created.status).toBe(201);
    expect(created.payload.warnings).toEqual([]);
    expect(created.payload.user.role).toBe("admin");

    const { readSettings } = await import("../services/settings.service");
    const settings = await readSettings();
    expect(settings.businessName).toBe("Test Rice Mill");
    expect(settings.language).toBe("ur");

    const { listFiscalYears } = await import("../services/fiscal-years.service");
    const years = await listFiscalYears();
    expect(years.map((y: any) => [y.name, y.status])).toEqual([["FY 2026-27", "open"]]);

    const { getBalance } = await import("../services/cash-in-hand.service");
    expect((await getBalance(1)).openingBalance).toBe(50000);

    expect((await call(auth.setupStatus)).payload.needsSetup).toBe(false);
    expect((await call(auth.bootstrapAdmin, body)).status).toBe(403);
  });

  it("rejects a short password before touching anything", async () => {
    const res = await call(auth.bootstrapAdmin, { fullName: "X", username: "x", password: "short" });
    expect(res.status).toBe(400);
  });
});
