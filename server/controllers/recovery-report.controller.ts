import type { Request, Response } from "express";
import { sqlite } from "../models/db";

/** Output product -> recovery bucket. Mirrors the name-based classifyProduct in dashboard.service. */
export function outputBucket(name: string): "headRice" | "broken" | "nakoo" {
  const label = name.toLowerCase();
  if (label.includes("broken")) return "broken";
  if (label.includes("nakoo")) return "nakoo";
  return "headRice";
}

type Totals = { batches: number; inputKg: number; headRice: number; broken: number; nakoo: number; wastage: number };

const empty = (): Totals => ({ batches: 0, inputKg: 0, headRice: 0, broken: 0, nakoo: 0, wastage: 0 });

/** Kg totals -> the same figures plus each bucket as a % of input. */
function withPercents(t: Totals) {
  const pct = (kg: number) => (t.inputKg > 0 ? Math.round((kg / t.inputKg) * 10000) / 100 : 0);
  return {
    ...t,
    headRicePct: pct(t.headRice),
    brokenPct: pct(t.broken),
    nakooPct: pct(t.nakoo),
    wastagePct: pct(t.wastage),
  };
}

function daySeconds(v: unknown, endOfDay: boolean): number | undefined {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) return undefined;
  const d = endOfDay ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59) : new Date(+m[1], +m[2] - 1, +m[3]);
  return Math.floor(d.getTime() / 1000);
}

type BatchRow = {
  id: number;
  batchNumber: string;
  sourceName: string;
  sourceQuantity: string;
  completedAt: number;
  legacyOutputName: string | null;
  legacyOutputQty: string | null;
};

/** Pure aggregation, kept separate from SQL so it can be checked directly. */
export function buildRecovery(batches: BatchRow[], outputs: { processingId: number; name: string; quantity: string }[]) {
  const outputsByBatch = new Map<number, { name: string; quantity: string }[]>();
  for (const o of outputs) {
    const list = outputsByBatch.get(o.processingId) ?? [];
    list.push(o);
    outputsByBatch.set(o.processingId, list);
  }

  const overall = empty();
  const bySource = new Map<string, Totals>();
  const byMonth = new Map<string, Totals>();

  const rows = batches.map((b) => {
    const t = empty();
    t.batches = 1;
    t.inputKg = Number(b.sourceQuantity) || 0;
    // Batches from before multi-output processing carry a single output on the batch row.
    const outs =
      outputsByBatch.get(b.id) ??
      (b.legacyOutputName && b.legacyOutputQty ? [{ name: b.legacyOutputName, quantity: b.legacyOutputQty }] : []);
    for (const o of outs) t[outputBucket(o.name)] += Number(o.quantity) || 0;
    t.wastage = Math.max(t.inputKg - t.headRice - t.broken - t.nakoo, 0);

    const done = new Date(b.completedAt * 1000);
    const month = `${done.getFullYear()}-${String(done.getMonth() + 1).padStart(2, "0")}`;
    for (const [map, key] of [
      [bySource, b.sourceName],
      [byMonth, month],
    ] as const) {
      const agg = map.get(key) ?? empty();
      for (const k of Object.keys(agg) as (keyof Totals)[]) agg[k] += t[k];
      map.set(key, agg);
    }
    for (const k of Object.keys(overall) as (keyof Totals)[]) overall[k] += t[k];

    return { id: b.id, batchNumber: b.batchNumber, source: b.sourceName, completedAt: b.completedAt * 1000, ...withPercents(t) };
  });

  return {
    overall: withPercents(overall),
    bySource: [...bySource].map(([source, t]) => ({ source, ...withPercents(t) })).sort((a, b) => b.inputKg - a.inputKg),
    byMonth: [...byMonth].map(([month, t]) => ({ month, ...withPercents(t) })).sort((a, b) => a.month.localeCompare(b.month)),
    batches: rows,
  };
}

/** GET /api/reports/recovery?fromDate=&toDate= — completed batches only, by completion date. */
export function recoveryReport(req: Request, res: Response) {
  try {
    const where = ["p.status = 'completed'"];
    const params: number[] = [];
    const from = daySeconds(req.query.fromDate, false);
    const to = daySeconds(req.query.toDate, true);
    if (from !== undefined) {
      where.push("p.completed_date >= ?");
      params.push(from);
    }
    if (to !== undefined) {
      where.push("p.completed_date <= ?");
      params.push(to);
    }

    const batches = sqlite
      .prepare(
        `SELECT p.id, p.batch_number AS batchNumber, sp.name AS sourceName, p.source_quantity AS sourceQuantity,
                COALESCE(p.completed_date, p.start_date) AS completedAt,
                op.name AS legacyOutputName, p.output_quantity AS legacyOutputQty
           FROM processing p
           JOIN products sp ON sp.id = p.source_product_id
           LEFT JOIN products op ON op.id = p.output_product_id
          WHERE ${where.join(" AND ")}
          ORDER BY completedAt DESC`,
      )
      .all(...params) as BatchRow[];

    const ids = batches.map((b) => b.id);
    const outputs = ids.length
      ? (sqlite
          .prepare(
            `SELECT o.processing_id AS processingId, pr.name, o.quantity
               FROM processing_outputs o JOIN products pr ON pr.id = o.product_id
              WHERE o.processing_id IN (${ids.map(() => "?").join(",")})`,
          )
          .all(...ids) as { processingId: number; name: string; quantity: string }[])
      : [];

    res.json(buildRecovery(batches, outputs));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to build recovery report" });
  }
}
