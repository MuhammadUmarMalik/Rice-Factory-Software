import type { Request, Response } from "express";
import { sqlite } from "../models/db";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** "YYYY-MM-DD" -> epoch seconds at local start (or end) of that day. */
function daySeconds(v: unknown, endOfDay: boolean): number | undefined {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
  if (!m) return undefined;
  const d = endOfDay
    ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59)
    : new Date(+m[1], +m[2] - 1, +m[3]);
  return Math.floor(d.getTime() / 1000);
}

/**
 * GET /api/audit-logs?entity=&action=&userId=&entityId=&fromDate=&toDate=&limit=&offset=
 * Newest first. performed_at is stored in epoch seconds.
 */
export function listAuditLogs(req: Request, res: Response) {
  try {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      if (value === undefined) return;
      where.push(sql);
      params.push(value);
    };
    add("a.entity = ?", str(req.query.entity));
    add("a.action = ?", str(req.query.action));
    const userId = Number(req.query.userId);
    add("a.performed_by = ?", Number.isInteger(userId) && userId > 0 ? userId : undefined);
    const entityId = Number(req.query.entityId);
    add("a.entity_id = ?", Number.isInteger(entityId) && entityId > 0 ? entityId : undefined);
    add("a.performed_at >= ?", daySeconds(req.query.fromDate, false));
    add("a.performed_at <= ?", daySeconds(req.query.toDate, true));

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = sqlite
      .prepare(
        `SELECT a.id, a.entity, a.entity_id AS entityId, a.action, a.before_json AS beforeJson,
                a.after_json AS afterJson, a.performed_by AS performedBy, COALESCE(u.full_name, u.username) AS performedByName,
                a.performed_at * 1000 AS performedAt, a.source
           FROM audit_logs a LEFT JOIN users u ON u.id = a.performed_by
           ${whereSql}
          ORDER BY a.performed_at DESC, a.id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);
    const { total } = sqlite
      .prepare(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`)
      .get(...params) as { total: number };
    const facets = sqlite
      .prepare(`SELECT DISTINCT entity, action FROM audit_logs ORDER BY entity, action`)
      .all() as { entity: string; action: string }[];

    res.json({
      rows,
      total,
      entities: [...new Set(facets.map((f) => f.entity))],
      actions: [...new Set(facets.map((f) => f.action))],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
}
