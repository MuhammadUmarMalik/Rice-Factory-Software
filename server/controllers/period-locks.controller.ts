import type { Request, Response } from "express";
import * as periodLocksService from "../services/period-locks.service";
import { parseRequiredInt } from "../utils/parse";

/**
 * "YYYY-MM-DD" -> local-time Date. `new Date("YYYY-MM-DD")` is UTC midnight,
 * which left most of the lock's last day open for posting.
 */
function parseDay(value: unknown, label: string, endOfDay: boolean): Date {
  const m = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!m) throw new Error(`${label} must be YYYY-MM-DD`);
  const d = endOfDay
    ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
    : new Date(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} is invalid`);
  return d;
}

export async function listPeriodLocks(_req: Request, res: Response) {
  try {
    const locks = await periodLocksService.listPeriodLocks();
    res.json(locks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch period locks" });
  }
}

export async function createPeriodLock(req: Request, res: Response) {
  try {
    const fromDate = parseDay(req.body?.fromDate, "fromDate", false);
    const toDate = parseDay(req.body?.toDate, "toDate", true);
    if (fromDate > toDate) throw new Error("fromDate must be on or before toDate");
    const reason = typeof req.body?.reason == "string" ? req.body.reason.trim() || undefined : undefined;
    const createdBy = req.user?.id;
    const created = await periodLocksService.createPeriodLock({ fromDate, toDate, reason, createdBy } as any);
    res.json(created);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function deletePeriodLock(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid period lock id" });
    const ok = await periodLocksService.deletePeriodLock(id);
    res.json({ success: ok });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete period lock" });
  }
}
