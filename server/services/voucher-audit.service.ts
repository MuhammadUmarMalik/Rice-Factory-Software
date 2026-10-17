import { db, sqlite } from "../models/db";
import { auditLogs } from "../db/schema";

export type VoucherAuditAction = "create" | "update" | "delete";

export function insertVoucherAuditLog(
  voucherType: string,
  recordId: number,
  action: VoucherAuditAction,
  beforeJson: unknown,
  afterJson: unknown,
  userId?: number,
  source: "voucher" | "api" = "voucher",
) {
  try {
    db.insert(auditLogs)
      .values({
        entity: voucherType,
        entityId: recordId,
        action,
        beforeJson: beforeJson ? JSON.stringify(beforeJson) : null,
        afterJson: afterJson ? JSON.stringify(afterJson) : null,
        performedBy: userId ?? null,
        source,
      })
      .run();
  } catch (error) {
    console.error("Failed to write voucher audit log", error);
  }
}

export function getVoucherAuditLogs(recordId: number) {
  return sqlite
    .prepare(
      `SELECT * FROM audit_logs WHERE entity_id = ? AND source = 'voucher' ORDER BY performed_at DESC, id DESC LIMIT 500`,
    )
    .all(recordId);
}
