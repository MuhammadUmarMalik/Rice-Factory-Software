-- 0001_gate_passes.sql
-- Gate Pass module (physical movement control documents).
--
-- Idempotent by design: every statement uses IF NOT EXISTS so this migration
-- is safe to run against a database where drizzle-kit push already created the
-- tables (fresh installs) as well as one that predates the module (existing
-- installs). Gate passes never post to the ledger or move stock, so no data
-- backfill is required.

CREATE TABLE IF NOT EXISTS "gate_passes" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "number" text NOT NULL,
  "direction" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ISSUED',
  "issued_at" integer NOT NULL DEFAULT (unixepoch()),
  "completed_at" integer,
  "vehicle_no" text,
  "driver_name" text,
  "driver_phone" text,
  "party_id" integer REFERENCES "accounts"("id"),
  "source_type" text,
  "source_id" integer,
  "gross_g" integer,
  "tare_g" integer,
  "net_g" integer,
  "remarks" text,
  "created_by" integer REFERENCES "users"("id"),
  "cancelled_reason" text,
  "cancelled_by" integer REFERENCES "users"("id"),
  "cancelled_at" integer,
  "fiscal_year_id" integer REFERENCES "fiscal_years"("id"),
  "created_at" integer NOT NULL DEFAULT (unixepoch()),
  "updated_at" integer NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS "gate_passes_number_unique" ON "gate_passes" ("number");
CREATE INDEX IF NOT EXISTS "idx_gate_passes_source" ON "gate_passes" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "idx_gate_passes_vehicle" ON "gate_passes" ("vehicle_no");
CREATE INDEX IF NOT EXISTS "idx_gate_passes_issued_at" ON "gate_passes" ("issued_at");

CREATE TABLE IF NOT EXISTS "gate_pass_items" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "gate_pass_id" integer NOT NULL REFERENCES "gate_passes"("id") ON DELETE CASCADE,
  "product_id" integer NOT NULL REFERENCES "products"("id"),
  "bags" integer NOT NULL DEFAULT 0,
  "weight_g" integer NOT NULL DEFAULT 0,
  "sale_item_id" integer REFERENCES "sale_items"("id"),
  "purchase_item_id" integer REFERENCES "purchase_items"("id"),
  "created_at" integer NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS "idx_gate_pass_items_pass" ON "gate_pass_items" ("gate_pass_id");
