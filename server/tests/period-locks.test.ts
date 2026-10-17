/**
 * A lock "to 2026-09-30" must cover the whole of Sept 30, not stop at midnight
 * at the start of it. Bootstraps a throwaway DB the same way gate-passes.test.ts does.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const testDir = path.resolve(process.cwd(), ".test-data");
const testDbPath = path.join(testDir, "period-locks.test.db");
process.env.DATABASE_URL = testDbPath;

let controller!: typeof import("../controllers/period-locks.controller");
let guard!: typeof import("../services/posting-guard.service");

function call(body: unknown) {
  let status = 200;
  let payload: any;
  const res: any = {
    status(code: number) {
      status = code;
      return res;
    },
    json(value: unknown) {
      payload = value;
      return res;
    },
  };
  return controller.createPeriodLock({ body } as any, res).then(() => ({ status, payload }));
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(testDbPath + suffix, { force: true });
  fs.mkdirSync(testDir, { recursive: true });
  const { ensureSchema } = await import("../utils/ensure-schema");
  ensureSchema();
  controller = await import("../controllers/period-locks.controller");
  guard = await import("../services/posting-guard.service");
});

describe("period locks", () => {
  it("locks the full last day and nothing after it", async () => {
    const { status } = await call({ fromDate: "2026-09-01", toDate: "2026-09-30", reason: "Sept closed" });
    expect(status).toBe(200);

    expect(() => guard.assertPeriodNotLocked(null, new Date(2026, 8, 1, 0, 0), "test")).toThrow(/locked/);
    expect(() => guard.assertPeriodNotLocked(null, new Date(2026, 8, 30, 18, 0), "test")).toThrow(/locked/);
    expect(() => guard.assertPeriodNotLocked(null, new Date(2026, 9, 1, 0, 0), "test")).not.toThrow();
    expect(() => guard.assertPeriodNotLocked(null, new Date(2026, 7, 31, 23, 59), "test")).not.toThrow();
  });

  it("rejects a reversed range", async () => {
    const { status, payload } = await call({ fromDate: "2026-10-10", toDate: "2026-10-01" });
    expect(status).toBe(400);
    expect(payload.error).toMatch(/on or before/);
  });
});
