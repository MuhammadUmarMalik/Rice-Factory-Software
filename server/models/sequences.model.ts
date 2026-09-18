/**
 * Document number sequences (SAL-2026-0001, BILL-2026-00001, ...), extracted
 * from storage.ts so purchases.model and sales.model can number their own
 * documents.
 *
 * Document numbers form one global sequence with the current year as a label.
 * Deriving the next value from the newest row alone broke in two ways: a NULL
 * number (gate passes are nullable) or a malformed legacy value restarted the
 * sequence at 1 or produced `NaN`, yielding duplicates and UNIQUE-constraint
 * failures. Take the highest numeric suffix across all rows instead.
 *
 * `rtrim(x, '0123456789')` strips the trailing digits to leave the prefix,
 * which is then removed to isolate the sequence; rows without a numeric suffix
 * contribute 0.
 */
import { sqlite } from "./db";

export function nextDocumentSequence(table: string, column: string): number {
  const row = sqlite
    .prepare(
      `SELECT COALESCE(MAX(CAST(replace(x, rtrim(x, '0123456789'), '') AS INTEGER)), 0) AS maxSeq
         FROM (SELECT "${column}" AS x FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" != '')`,
    )
    .get() as { maxSeq: number } | undefined;
  const maxSeq = Number(row?.maxSeq ?? 0);
  return (Number.isFinite(maxSeq) && maxSeq > 0 ? maxSeq : 0) + 1;
}
