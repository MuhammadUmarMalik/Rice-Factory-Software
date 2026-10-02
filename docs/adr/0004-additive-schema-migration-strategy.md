# ADR 0004: Schema evolution is additive and applied at boot

Status: accepted
Date: 2026-09-12
Related: server/models/db.ts (`ensureColumn`), server/services/*.ts
(`ensureTable`), script/0002_receipt_voucher_audit_logs.sql,
script/0003_users_must_change_password.sql

## Context

The `.sql` files under `script/` are not run automatically, and installed desktop
installations carry a live `data.db` that will never see `drizzle-kit push`. A
column added to `db/schema.ts` without a runtime step would break every SELECT
against an existing database (“no such column”). The app has to self-upgrade on
boot because desktop users do not run migrations by hand.

Mill-Manager constraints: SQLite single-writer, desktop/Electron delivery, live
installed data that must keep working, and DDL that must be safe to run
repeatedly.

## Decision

Schema evolution is additive and idempotent, applied at boot before anything
queries:

- **Columns that sit on tables read during login** are added with
  `ensureColumn(table, column, ddl)` in `server/models/db.ts`, which checks
  `PRAGMA table_info` and runs `ALTER TABLE ... ADD COLUMN` only when the column
  is missing. It mirrors the equivalent statement in the `.sql` script (e.g.
  `0003_users_must_change_password.sql`).
- **New tables** are created by idempotent `ensureTable()` calls in the service
  that owns them (`CREATE TABLE IF NOT EXISTS ...`), mirroring the `.sql`
  variant (e.g. `0002_receipt_voucher_audit_logs.sql`).
- Fresh databases get the full shape from `db/schema.ts` via drizzle; the
  additive steps are a no-op there.

## Consequences

**Positive**

- Existing installations self-upgrade on first boot after an upgrade — no manual
  migration step, no broken SELECTs from a schema-only change.
- DDL runs are idempotent and safe to repeat.

**Negative**

- The canonical column definition lives in `db/schema.ts` while the additive
  DDL is duplicated in `ensureColumn`/`ensureTable` and its `.sql` mirror; they
  must be kept in sync by hand.
- Additive-only DDL is fine for adding columns/tables but unsuitable for
  renames or destructive changes.

**What this forecloses**

- Destructive or renaming migrations on the live database. A real rename or
  reshape needs a proper migration path with backup and verification (see the
  data-reset backups in `.local/` for the current safety net).
- Relying on operators to run `script/*.sql` by hand.

## Alternatives considered

- **Require a manual migration on upgrade.** Rejected: desktop users cannot be
  expected to run SQL.
- **Run `drizzle-kit push` at boot.** Rejected: mutating the live database from
  production boot is too risky; additive `ALTER TABLE` checks are surgical.
- **Full migration framework (e.g. SQLite migrations with version table).**
  Rejected for now as heavier than the additive cases we actually hit; revisit
  when a destructive migration is first needed.