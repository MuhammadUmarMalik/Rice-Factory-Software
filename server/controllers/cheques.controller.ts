import type { Request, Response } from "express";
import { z } from "zod";
import { sqlite } from "../models/db";
import { getUserId } from "../utils/auth";

export type ChequeStatus = "pending" | "deposited" | "cleared" | "bounced" | "cancelled";

/** Allowed next states. Cleared and cancelled are final; a bounced cheque can be re-presented. */
export const NEXT_STATUS: Record<ChequeStatus, ChequeStatus[]> = {
  pending: ["deposited", "cleared", "bounced", "cancelled"],
  deposited: ["cleared", "bounced"],
  bounced: ["pending", "cancelled"],
  cleared: [],
  cancelled: [],
};

const createSchema = z.object({
  direction: z.enum(["received", "issued"]),
  partyId: z.number().int().positive().nullable().optional(),
  chequeNo: z.string().trim().min(1, "Cheque number is required").max(50),
  bankName: z.string().trim().max(100).optional(),
  amount: z.coerce.number().positive("Amount must be positive"),
  chequeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "chequeDate must be YYYY-MM-DD"),
  notes: z.string().trim().max(500).optional(),
});

/** "YYYY-MM-DD" -> epoch seconds at local midnight. */
function daySeconds(v: string): number {
  const [y, m, d] = v.split("-").map(Number);
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
}

const SELECT = `
  SELECT c.id, c.direction, c.party_id AS partyId, a.name AS partyName, c.cheque_no AS chequeNo,
         c.bank_name AS bankName, c.amount, c.cheque_date * 1000 AS chequeDate, c.status, c.notes,
         c.status_changed_at * 1000 AS statusChangedAt
    FROM cheques c LEFT JOIN accounts a ON a.id = c.party_id`;

export function listCheques(req: Request, res: Response) {
  try {
    const where: string[] = [];
    const params: string[] = [];
    for (const field of ["status", "direction"] as const) {
      const v = req.query[field];
      if (typeof v === "string" && v && v !== "all") {
        where.push(`c.${field} = ?`);
        params.push(v);
      }
    }
    const rows = sqlite
      .prepare(`${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY c.cheque_date ASC, c.id ASC`)
      .all(...params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch cheques" });
  }
}

export function createCheque(req: Request, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid cheque" });
  const c = parsed.data;
  try {
    const { lastInsertRowid } = sqlite
      .prepare(
        `INSERT INTO cheques (direction, party_id, cheque_no, bank_name, amount, cheque_date, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(c.direction, c.partyId ?? null, c.chequeNo, c.bankName || null, String(c.amount), daySeconds(c.chequeDate), c.notes || null, getUserId(req) ?? null);
    res.status(201).json(sqlite.prepare(`${SELECT} WHERE c.id = ?`).get(lastInsertRowid));
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export function updateChequeStatus(req: Request, res: Response) {
  const id = Number(req.params.id);
  const next = req.body?.status as ChequeStatus;
  if (!Number.isInteger(id) || !(next in NEXT_STATUS)) return res.status(400).json({ error: "Invalid request" });
  const row = sqlite.prepare("SELECT status FROM cheques WHERE id = ?").get(id) as { status: ChequeStatus } | undefined;
  if (!row) return res.status(404).json({ error: "Cheque not found" });
  if (!NEXT_STATUS[row.status].includes(next)) {
    return res.status(400).json({ error: `A ${row.status} cheque cannot be marked ${next}` });
  }
  sqlite.prepare("UPDATE cheques SET status = ?, status_changed_at = unixepoch() WHERE id = ?").run(next, id);
  res.json(sqlite.prepare(`${SELECT} WHERE c.id = ?`).get(id));
}

export function deleteCheque(req: Request, res: Response) {
  const id = Number(req.params.id);
  const row = sqlite.prepare("SELECT status FROM cheques WHERE id = ?").get(id) as { status: ChequeStatus } | undefined;
  if (!row) return res.status(404).json({ error: "Cheque not found" });
  if (row.status !== "pending" && row.status !== "cancelled") {
    return res.status(400).json({ error: "Only pending or cancelled cheques can be deleted" });
  }
  sqlite.prepare("DELETE FROM cheques WHERE id = ?").run(id);
  res.status(204).send();
}
