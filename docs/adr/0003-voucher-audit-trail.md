# ADR 0003: Every receipt/payment voucher keeps an audit trail

Status: accepted
Date: 2026-09-12
Related: server/services/voucher-audit.service.ts,
server/services/daybooks.service.ts, script/0002_receipt_voucher_audit_logs.sql

## Context

Daybook/journal writes already captured a before/after snapshot per change, but
`payments.service.ts` and `receipts.service.ts` moved money without recording who
changed what. An operator could alter or delete a receipt voucher and nothing
would say when, by whom, or what it looked like before.

Mill-Manager constraints: money movements are invariants; vouchers are the
audited unit; desktop deployment means there is no security department watching
the database — the audit becomes the evidence.

## Decision

Money movements on receipts and payments are logged to a
`receipt_voucher_audit_logs` table: one row per create/update/delete carrying
`voucher_type`, `record_id`, `action`, the `before`/`after` JSON snapshots,
`changed_by`, and `changed_at`. The write is wrapped by
`voucher-audit.service.ts`'s `insertVoucherAuditLog`, which never throws: an
audit failure must not roll back or fail a voucher that has already been written,
and must not alter the controller's response. Reads cap at the newest 500 rows
per voucher. The table (and its index) is created idempotently at boot, mirroring
the equivalent DDL in `script/0002_receipt_voucher_audit_logs.sql`.

## Consequences

**Positive**

- Receipts and payments now match the daybook/journal audit posture: who,
  when, and what changed are recoverable for every voucher.
- A failed audit write cannot silently roll back real money movement — the money
  stays, the log stays best-effort.

**Negative**

- An extra small write per voucher mutation.
- Log rows are append-only and unbounded; reads are capped but there is no
  retention policy yet.

**What this forecloses**

- Keeping voucher mutations unaudited; it also makes "silent delete" of a
  receipt impossible to hide.
- For now, audit-verifying a deletion (the log records it; nothing re-posts it).

## Alternatives considered

- **Rely on SQLite atomicity / existing daybook audit alone.** Rejected:
  receipts and payments are a distinct voucher class and were not covered.
- **Make the audit write part of the voucher transaction.** Rejected: it would
  let an audit failure undo money movement — exactly the failure mode a
  best-effort audit must avoid.