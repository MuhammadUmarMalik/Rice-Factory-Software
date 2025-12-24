import type { Request, Response } from "express";
import * as periodLocksService from "../services/period-locks.service";
import { parseOptionalInt, parseRequiredDate } from "../utils/parse";

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
    const fromDate = parseRequiredDate(req.body?.fromDate, "fromDate");
    const toDate = parseRequiredDate(req.body?.toDate, "toDate");
    const reason = typeof req.body?.reason == "string" ? req.body.reason : undefined;
    const createdBy = parseOptionalInt(req.body?.createdBy);
    const created = await periodLocksService.createPeriodLock({ fromDate, toDate, reason, createdBy } as any);
    res.json(created);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: (error as Error).message });
  }
}

export async function deletePeriodLock(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);
    const ok = await periodLocksService.deletePeriodLock(id);
    res.json({ success: ok });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete period lock" });
  }
}
