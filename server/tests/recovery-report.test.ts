import { describe, it, expect } from "vitest";
import { buildRecovery, outputBucket } from "../controllers/recovery-report.controller";

const sec = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000);

describe("recovery report", () => {
  it("classifies output products", () => {
    expect(outputBucket("HEAD RICE 1509")).toBe("headRice");
    expect(outputBucket("HEAD RICE BROKEN KAINAT 1121")).toBe("broken");
    expect(outputBucket("HEAD NAKOO 1509")).toBe("nakoo");
  });

  it("sums buckets, derives wastage, and groups by source and month", () => {
    const report = buildRecovery(
      [
        { id: 1, batchNumber: "B1", sourceName: "PADDY 1509", sourceQuantity: "1000", completedAt: sec(2026, 9, 5), legacyOutputName: null, legacyOutputQty: null },
        { id: 2, batchNumber: "B2", sourceName: "PADDY 1509", sourceQuantity: "1000", completedAt: sec(2026, 10, 2), legacyOutputName: null, legacyOutputQty: null },
        // Legacy single-output batch: no processing_outputs rows.
        { id: 3, batchNumber: "B3", sourceName: "PADDY 1121", sourceQuantity: "500", completedAt: sec(2026, 10, 3), legacyOutputName: "HEAD RICE KAINAT 1121", legacyOutputQty: "300" },
      ],
      [
        { processingId: 1, name: "HEAD RICE 1509", quantity: "600" },
        { processingId: 1, name: "HEAD BROKEN 1509", quantity: "150" },
        { processingId: 1, name: "HEAD NAKOO 1509", quantity: "50" },
        { processingId: 2, name: "HEAD RICE 1509", quantity: "500" },
      ],
    );

    expect(report.batches.find((b) => b.id === 1)).toMatchObject({ headRicePct: 60, brokenPct: 15, nakooPct: 5, wastage: 200, wastagePct: 20 });
    expect(report.batches.find((b) => b.id === 3)).toMatchObject({ headRice: 300, wastage: 200 });

    const p1509 = report.bySource.find((s) => s.source === "PADDY 1509")!;
    expect(p1509).toMatchObject({ batches: 2, inputKg: 2000, headRice: 1100, headRicePct: 55 });
    expect(report.byMonth.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(report.overall).toMatchObject({ batches: 3, inputKg: 2500, headRice: 1400, headRicePct: 56 });
  });
});
