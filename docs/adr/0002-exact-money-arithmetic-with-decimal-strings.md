# ADR 0002: Canonical money arithmetic on decimal strings, exact to 2dp half-up

Status: accepted
Date: 2026-09-12
Related: server/utils/money.ts

## Context

Money is stored as decimal strings in the schema, but aggregation ran through
`parseFloat`/`Number`, so long chains of additions accumulated binary
floating-point error (`0.1 + 0.2 !== 0.3`). With stock priced per kg across
thousands of rows, those errors surfaced as off-by-a-paisa totals in reports,
ledgers, and stock valuation.

Mill-Manager constraints: money/stock/ledger are invariants; the ledger rounds
to 2dp; installed desktop data must keep producing the same answers after a
change.

## Decision

All server-side money arithmetic goes through `server/utils/money.ts`, which
wraps `decimal.js`. Amounts are summed exactly as `Decimal` and only the final
value is rendered as a fixed 2dp decimal string (`MONEY_DP = 2`,
`Decimal.ROUND_HALF_UP`) or coerced to a number at the response boundary.
Unparseable or non-finite input coerces to zero so one bad row can never poison
a total with NaN.

## Consequences

**Positive**

- Arbitrary chains of addition are exact; float conversion happens once, at the
  edge.
- A single rounding rule (`2dp, half-up`) applies to every total instead of each
  call site deciding.
- The helpers mirror the old `parseAmount`/`parseNum` NaN guards, so behaviour
  on malformed rows is unchanged.

**Negative**

- A new runtime dependency (`decimal.js`) and a discipline requirement: new
  summing code must route through the helpers rather than `reduce + Number`.
- Responses that are `number`-typed still pass through `Number()`; the float
  conversion is centralised but not eliminated.

**What this forecloses**

- Accumulating money via binary floats anywhere on the server.
- Per-callsite rounding decisions; drift in how a total is rounded.

## Alternatives considered

- **Keep float arithmetic.** Rejected: it is the source of the observed errors.
- **Store money as integer minor units (cents/paisa).** Rejected: the live schema
  already stores decimal strings and installed data cannot be silently migrated;
  `decimal.js` achieves exactness without a storage migration.