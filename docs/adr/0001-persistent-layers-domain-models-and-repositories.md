# ADR 0001: Split the monolithic storage module into per-domain models with a repository layer

Status: accepted
Date: 2026-09-12
Related: server/models/*.model.ts, server/repositories/types.ts,
server/repositories/storage-adapter.ts, server/container.ts

## Context

Persistence lived in a single `server/models/storage.ts` module of ~8,200 lines.
Sections were organised by domain (accounts, products, purchases, sales, …) but
the file was edited by every server feature, so every money/stock/ledger change
touched one giant merge surface. The transaction-scoped privates the whole file
depended on — `postLedgerEntry`, `ensureSystemAccount`, the fiscal-calendar
bootstrap, the posting guards — had 12+ call sites across unrelated documents,
so they could not be moved casually.

Mill-Manager constraints that shaped the decision: SQLite single-writer,
desktop/Electron delivery with installed live data, and the money/stock/ledger
invariants that a wrong extraction must not disturb.

## Decision

Persistence is now split into per-domain model modules under
`server/models/*.model.ts` (one per domain: accounts, products, purchases, sales,
expenses, ledger, journal vouchers, processing, payroll, reports, fiscal years,
period locks, notifications, sequences, users). Each module owns its queries and
writes against `db/schema.ts` and lets a transaction-scoped client be passed in
as the first argument where a transaction needs it. Thin repository adapters in
`server/repositories/storage-adapter.ts`, typed by `repositories/types.ts`, wrap
the four core CRUD domains, and `server/container.ts` hands those repositories to
the services that need a seam for testing. Every other service imports the model
modules directly.

The ledger-posting internals that the old file’s transaction-scoped privates
depended on stay where they are for now; extracting them is a separate job scoped
out of this pass.

## Consequences

**Positive**

- A change to account behaviour no longer forces you to reread the purchases
  section; files are domain-sized and diffs are reviewable.
- The four core domains are reachable through a repository interface, so
  services can accept a fake for tests without a heavier framework.
- `script/load-models.ts` gives the narration/test scripts the old flat call
  surface (`models.getDayBook(...)`) without importing the monolith.
- The extraction is mechanical — no data migration, no behavioural change.

**Negative**

- Two access paths now exist (repository via `container`, direct model import),
  and a service could pick either inconsistently. The split is only justified
  where a seam is actually used.
- `load-models` reassembles disjoint exports by spreading them; a duplicate
  export name across two domain modules would silently shadow. New model
  functions must keep disjoint names.

**What this forecloses**

- Continuing to extend a single ~8,000-line persistence module.
- For now, moving the ledger-posting internals: anything that needs them still
  imports from the domain module that hosts them, and the coupling is documented
  in `server/models/accounts.model.ts`.

## Alternatives considered

- **Keep `storage.ts`.** Rejected: the merge surface and inability to reason
  about one domain in isolation were the problem, not cosmetic.
- **Full ports-and-adapters everywhere (interface per domain, injected
  everywhere).** Rejected as over-engineering for a single-writer SQLite app;
  repositories were introduced only where services need a test seam.
- **Generated repositories per table (e.g. over Drizzle).** Rejected: Drizzle
  already provides typed queries; a repository that only forwards adds ceremony
  without a test or transaction boundary.