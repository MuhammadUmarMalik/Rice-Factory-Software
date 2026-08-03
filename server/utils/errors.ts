/**
 * Services and the storage layer signal business-rule violations by throwing a
 * plain `Error`. Controllers used to map *every* `Error` to a 400, which both
 * mislabelled genuine server faults as client mistakes and leaked internal
 * messages (stack-adjacent text, driver errors) to the API consumer.
 *
 * Only messages matching a known business rule may become a 400; anything else
 * is a 500 with a generic message and a server-side log.
 */
const BUSINESS_RULE_PATTERNS: RegExp[] = [
  /insufficient stock/i,
  /discount cannot exceed/i,
  /cannot be negative/i,
  /not found/i,
  /already exists|duplicate/i,
  /locked|closed period|posting is not allowed/i,
  /must (be|not|have|match|remain)/i,
  /cannot (be|exceed|delete|remove|change)/i,
  /is required/i,
  /at least one/i,
  /do(es)? not balance|debit and credit/i,
  /invalid /i,
];

export function isBusinessRuleError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    BUSINESS_RULE_PATTERNS.some((pattern) => pattern.test(error.message))
  );
}
