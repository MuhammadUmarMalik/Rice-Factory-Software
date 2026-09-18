# Mill-Manager — Architecture & Code Review

**Date:** 2026-09-01
**Branch reviewed:** `chore/build-desktop-and-schema-tooling` (working tree, including uncommitted changes)
**Scope:** Full application — `server/`, `client/`, `electron/`, build & schema tooling

---

## 1. Executive Summary

Mill-Manager is an Electron-packaged accounting/ERP application for a flour mill: Express + Drizzle + SQLite on the server, React + Zustand + TanStack Query on the client, with a server-rendered PDF/print subsystem.

**The good news, stated plainly:** the security posture is genuinely above average for an app of this type. Password hashing is PBKDF2 at 120k iterations with timing-safe comparison, JWTs are verified with issuer *and* audience, every non-auth route carries an explicit `requireRoles` guard, rate limiting is applied to both auth and general API paths, Helmet/CORS/compression are wired, and the SQL that *is* hand-written uses bound parameters with a whitelist for sort columns. Someone has clearly gone through this with care. Financial correctness has also been attended to — there is a deliberate `roundMoney` helper with a comment explaining the exact IEEE-754 bug it was written to fix.

**The core problem is not security — it is structural.** The application's entire data layer is one 8,099-line class with 273 methods. A repository/DI abstraction was started to address this and then abandoned at ~15% coverage, so the codebase now carries *both* the god object and a half-built replacement, with services free to bypass the abstraction (and most do). Layered on top of that: zero automated tests anywhere in the repo, 442 `any` annotations that neutralize `strict: true` on the server, and a schema bootstrap that shells out to `npx drizzle-kit push` at runtime — including, as far as I can tell, on an end user's packaged desktop install.

Ranked by what I would actually fix first:

| # | Finding | Severity | Effort |
|---|---|---|---|
| 1 | Packaged desktop app shells out to `npx drizzle-kit push` at first run | **Critical** | M |
| 2 | No versioned migrations; schema evolves via ad-hoc `ALTER TABLE` patches | **Critical** | L |
| 3 | Zero automated tests in a double-entry accounting system | **Critical** | L |
| 4 | `roundMoney` bypassed on the two core balance-persistence paths | **High** | S |
| 5 | 8,099-line / 273-method god object (`models/storage.ts`) | **High** | L |
| 6 | Abandoned repository/DI layer — worst of both worlds | **High** | M |
| 7 | `ledger_entries` has no index on `account_id` or `entry_date` | **High** | S |
| 8 | Legacy password path compares plaintext | **Medium** | S |
| 9 | Print doc registry duplicated across client/server with divergent key namespaces | **Medium** | M |
| 10 | 442 `any` on the server defeats `strict: true` | **Medium** | M |
| 11 | Controllers bypassing the service layer | **Medium** | S |
| 12 | `staleTime: Infinity` + `retry: false` globally on the client | **Medium** | S |
| 13 | Dead `client/src/store/` directories; stray test scripts in `script/` | **Low** | S |

---

## 2. Architecture Map

```
┌─────────────────────────────────────────────────────────────┐
│  Electron shell  (electron/)                                │
│  └── spawns server, loads SPA at 127.0.0.1:5000             │
└─────────────────────────────────────────────────────────────┘
              │
┌─────────────┴───────────────────┐   ┌───────────────────────┐
│  client/  React 18 SPA          │   │  server/  Express     │
│  ├── app/       Auth/Login split│──▶│  ├── routes/     (25) │
│  ├── pages/     ~40 screens     │   │  ├── controllers/(25) │
│  ├── stores/    22 Zustand      │   │  ├── services/   (23) │
│  ├── api/        8 modules      │   │  ├── repositories/(3) │  ◀── vestigial
│  ├── print/     docRegistry     │   │  ├── models/          │
│  └── store/     ☠ 3 empty dirs  │   │  │   └── storage.ts   │  ◀── 8,099 LOC
└─────────────────────────────────┘   │  ├── db/schema.ts     │      273 methods
                                      │  ├── services/print/  │
                                      │  └── views/print/     │
                                      └───────────┬───────────┘
                                                  │
                                      ┌───────────▼───────────┐
                                      │ SQLite (better-sqlite3)│
                                      │ 53 tables in schema    │
                                      │ 56 tables live         │  ◀── drift
                                      └────────────────────────┘
```

The intended layering (`routes → controllers → services → repositories → db`) is declared but not enforced. In practice most services import `models/storage` directly, and four controllers skip the service layer entirely.

---

## 3. Critical Findings

### 3.1 Packaged desktop app shells out to `npx drizzle-kit push` at runtime

[server/utils/ensure-schema.ts:220](server/utils/ensure-schema.ts#L220), called unconditionally from [server/index.ts](server/index.ts) at boot.

```ts
execSync("npx drizzle-kit push", { cwd: serverDir, env, stdio: "inherit" });
```

On a fresh install where the `users` table is absent, the server invokes `npx drizzle-kit push` as a child process. This requires, on the end user's machine: a resolvable `npx`, the `drizzle-kit` package, `tsx` (injected via `NODE_OPTIONS: --import tsx`), and the `db/schema.ts` **source file** at a path derived from `__dirname`. In a packaged Electron app, `drizzle-kit` and `tsx` are devDependencies that are normally pruned, and sources are typically inside an asar archive where `execSync` with `cwd: serverDir` will not resolve.

If `npx` cannot resolve the package locally it attempts a **network download**, so first-run behaviour on an offline mill floor machine is either a hang or a failure. The catch block's guidance — "From the project root run: `npm run db:push --prefix server`" — is developer-facing instruction surfaced to an end user who has no project root and no npm.

**Fix:** ship a pre-built empty `data.db` as a packaged resource and copy it into `APP_DATA_DIR` on first run, or embed the generated `CREATE TABLE` DDL as a plain `.sql` string executed via `sqlite.exec()`. Either removes the child process, the network dependency, and the devDependency requirement.

---

### 3.2 No versioned migrations; schema evolves through ad-hoc `ALTER TABLE` patches

`drizzle.config.ts` declares `out: "./migrations"`, but **no `migrations/` directory exists anywhere in the repo.** Nothing has ever been generated. Schema evolution is instead handled by a hand-rolled 242-line idempotent patcher:

```ts
ensureAccountsColumns();   ensureSalesColumns();
ensurePurchasesColumns();  ensureProductColumns();
ensureCashAccounts();      ensureSequencesTable();
ensureIntegerTimestamps(); warnOrphanedCashLinks();
```

Each is a `PRAGMA table_info(...)` check followed by `ALTER TABLE ... ADD COLUMN`. The same pattern is duplicated *again* inside `models/storage.ts:745` (adding `sale_items.unit`) and in `daybooks.service.ts:76-87` — three independent schema-mutation mechanisms.

This has already produced measurable drift: **`db/schema.ts` declares 53 tables; the live database has 56.** Three tables exist in production that the schema file does not describe.

Consequences: the schema cannot be rebuilt from source, there is no rollback path, `ADD COLUMN` alone cannot express renames/drops/type or constraint changes, and every historical schema decision is now archaeology. For an accounting system where the database *is* the product, this is the highest-leverage structural debt in the repo.

**Fix:** run `drizzle-kit generate` to snapshot current state as migration `0000`, commit `migrations/`, switch `ensureSchema()` to `migrate()`, and retire the `ensure*Columns` patchers as their changes are absorbed. Reconcile the 3 orphan tables first.

---

### 3.3 Zero automated tests

```
Test files found:  0
Test runner:       none (npm test → tsx script/test-reports.ts)
vitest / jest:     not installed
```

There is no test file of any kind in `client/`, `server/`, `electron/`, or `script/`. `npm test` runs a single ad-hoc reporting script. The `script/` directory holds four more manual harnesses (`test-narration.ts`, `test-phase2-narration.ts`, `test-voucher-narration.ts`, `audit-reports.ts`, ~1,800 lines total) — three of which are uncommitted — that print to stdout and assert nothing.

This is a double-entry bookkeeping system handling ledgers, trial balances, payroll, tax and a balance sheet. The invariants that matter most (debits equal credits; `currentBalance` equals opening plus the sum of ledger entries; `balanceDue = totalAmount − paidAmount`; a purchase and its reversal net to zero) are exactly the kind of property that is cheap to test and expensive to get wrong silently. Right now a rounding regression in a mapper would surface as a customer disputing an invoice.

**Fix:** install Vitest and write ~20 tests against the accounting invariants before any refactor of `storage.ts` — they are the safety net that makes finding 3.5 tractable. Start with `postLedgerEntry`, `recomputeAccountBalances`, and the purchase/sale total pipelines.

---

## 4. High-Severity Findings

### 4.1 `roundMoney` is bypassed on both core balance-persistence paths

[server/models/storage.ts:537](server/models/storage.ts#L537) defines the helper with an explicit contract in its docblock:

> *"Raw IEEE-754 results such as 3 \* 33.33 = 99.99000000000001 were being written verbatim, which both looked wrong in the UI and made debit/credit totals fail to net to zero. **Round to paisa at every persistence boundary.**"*

It is used correctly in 45 places across the purchase, sale, and payment pipelines. But the two functions that actually persist account balances do not call it:

```ts
// storage.ts:2245-2249 — recomputeAccountBalances
.set({ currentBalance: (opening + delta).toString() })   // ← unrounded

// storage.ts:2262 — applyAccountBalanceInternal
client.update(accounts).set({ currentBalance: newBalance.toString() })  // ← unrounded
```

`applyAccountBalanceInternal` is called by `postLedgerEntry` on **every single ledger entry**, and its return value is also written to `ledger_entries.balance`. Because money is stored as `text` and re-parsed with `parseFloat` on each read, error accumulates across the running balance: each entry re-reads the previous unrounded string and adds to it.

**Failure scenario:** post three ledger entries of `33.33` to a debit-normal account with zero opening balance. `currentBalance` is persisted as `"99.99000000000001"`, and the trial balance for that account fails to net against a matching credit of `"99.99"`. The residual is invisible in the UI (which formats to 2dp) but breaks any equality check on totals.

**Fix:** wrap both writes in `roundMoney(...)`. Two-line change, and it is the highest value-per-character fix in this document.

---

### 4.2 `models/storage.ts` — 8,099 lines, 273 methods, one class

At 335 KB it is 4× the next-largest file and holds the entire data layer: accounts, products, purchases, sales, processing, receipts, payments, journal vouchers, ledger, payroll, employees, expenses, fiscal years, period locks, reports, dashboard, users, notifications, and inline schema migrations.

Concrete costs, all observable today:
- **Change amplification.** Every domain change touches the same file. Any two developers on any two features conflict.
- **No unit-testability.** The class is instantiated as a module-level singleton bound to a live SQLite handle; nothing in it can be exercised without a real database.
- **Private helpers are unreachable.** `roundMoney`, `parseAmount`, `nextDocumentSequence`, `toSaleQuantityKg`, and `toValidDate` are module-private. Finding 4.1 exists precisely because they cannot be shared or enforced from outside — and `daybooks.service.ts` and the print mappers have grown parallel implementations of the same parsing and formatting logic.
- **Editor/LSP degradation.** Type-checking and IntelliSense on a 8k-line file with 442 `any` is slow enough to change how people work in it.

**Fix:** extract by bounded context in dependency order (products → accounts → ledger → purchases → sales → …), one domain per PR, against the invariant tests from 3.3. Promote the private helpers to `server/utils/money.ts` **first** — that single step fixes 4.1 permanently and unblocks everything else.

---

### 4.3 The repository/DI layer is abandoned at ~15% coverage

`repositories/` contains 3 files totalling 144 lines. `storage-adapter.ts` says so itself:

```ts
/**
 * Repository implementations that delegate to the existing storage.
 * This provides abstraction for DI and future extraction.
 */
```

It covers 4 domains — accounts, products, purchases, sales — out of ~25. Every adapter method is a one-line pass-through (`getAccounts = (type, active) => storage.getAccounts(type, active)`). The container then re-exports the god object beside them:

```ts
export const container = {
  /** Full storage - use for operations not yet in repositories */
  storage,                          // ← the escape hatch everyone uses
  accounts: accountsRepo, products: productsRepo,
  purchases: purchasesRepo, sales: salesRepo,
};
```

18 files import `models/storage` directly. The abstraction is therefore pure overhead: it adds indirection and a second place to update when a signature changes, while delivering none of the testability it was built for, because the bypass is not just available but documented as the recommended path for anything not yet migrated.

**Fix:** decide and commit. Either finish the extraction (paired with 4.2, which is the same work) or delete `repositories/` and `container.ts` and stop paying for an abstraction nobody uses. The current middle state is strictly worse than either endpoint.

---

### 4.4 `ledger_entries` has no indexes

The hottest table in the application is declared with a `CHECK` constraint and nothing else — verified against the live database:

```
indexes on ledger_entries: []
total user indexes:        34   (all uniqueness constraints, no covering indexes)
schema.ts:                 7 index declarations across 53 tables, all uniqueIndex()
foreign key references:    137, none indexed
```

SQLite does not auto-index foreign keys. Every one of these does a full table scan of `ledger_entries`:
- `recomputeAccountBalances` — filters by `account_id`, called in a loop over affected accounts on every purchase/sale/voucher mutation
- `postLedgerEntry` — reads the account row per entry
- Ledger report, trial balance, balance sheet, income statement — all filter by `account_id` and/or range-scan `entry_date`

**Honest scoping:** the live DB is 424 KB with 18 ledger entries, so there is no user-visible problem *today*. This is latent, not active. But it compounds quadratically — `recomputeAccountBalances` scans the whole table once per affected account per mutation — so a mill running a year of daily transactions is the point where it becomes a support ticket, and by then the fix is the same three lines it is now.

**Fix:**
```sql
CREATE INDEX idx_ledger_entries_account_date ON ledger_entries(account_id, entry_date);
CREATE INDEX idx_ledger_entries_sale         ON ledger_entries(sale_id);
CREATE INDEX idx_ledger_entries_purchase     ON ledger_entries(purchase_id);
```
Then audit the remaining 137 FK columns for the ones used in joins and filters. Add these via a real migration (3.2), not another `ensure*` patcher.

---

## 5. Medium-Severity Findings

### 5.1 Legacy password path compares plaintext

[server/utils/auth.ts:48](server/utils/auth.ts#L48):

```ts
export function verifyPassword(plain: string, stored: string) {
  if (!stored || !stored.startsWith(`${HASH_PREFIX}$`)) {
    return { ok: safeCompare(plain, stored), needsUpgrade: true };   // ← plaintext compare
  }
  ...
}
```

Any `users` row whose password does not begin with `pbkdf2$` is authenticated by direct string comparison, meaning that row's password is stored in the clear. The `needsUpgrade` flag suggests a deliberate migration ramp, and the rest of this function is exemplary — but the fallback has no expiry, so it will silently remain a valid auth path forever.

**Fix:** query for non-`pbkdf2$` rows; if the count is zero (likely, given the app is young), delete the branch and return `{ ok: false }`. If not zero, force-reset those accounts and then delete the branch.

### 5.2 Print document registry is duplicated with divergent key namespaces

Two registries, in two languages of naming, that must be kept in lockstep by hand:

| | File | Keys |
|---|---|---|
| Client | [client/src/print/docRegistry.ts](client/src/print/docRegistry.ts) | `salesInvoice`, `dayBook`, `trialBalance` … (28) |
| Server | [server/services/print/registry.ts](server/services/print/registry.ts) | `invoice.sales`, `report.dayBook`, `report.trialBalance` … |

The client maintains a hand-written 28-entry translation table between the two. Adding a document type requires coordinated edits in `docRegistry.ts`, `registry.ts`, `mappers/index.ts`, and a view — with the client/server key mapping enforced by nothing but attention. A typo produces a runtime 404 from the print endpoint, not a compile error.

This subsystem is also the most churned area in recent history (`docRegistry.ts`, `registry.ts`, `mappers/index.ts`, `pdf/engine.ts` are all modified in the current working tree, and the last four commits touch print), which is exactly when a fragile contract costs the most.

**Fix:** make the server's dotted keys the single source of truth, export the union type from a shared location, and delete the client-side alias table. The 1,977-line `mappers/index.ts` should also be split per document family.

### 5.3 442 `any` annotations neutralize `strict: true` on the server

Both tsconfigs set `"strict": true` — good — but:

```
server:  442  occurrences of `: any` / `as any` / `<any>`
client:  109
```

The density is highest exactly where correctness matters most: `storage.ts` uses `(purchase as any).taxTypeId` and `(account as any)` inside money calculations, and `daybooks.service.ts` types every raw-SQL result as `as any` (a necessary consequence of bypassing Drizzle for hand-written SQL — see 5.4). The compiler is providing close to no protection over the financial paths.

**Fix:** enable `noImplicitAny` enforcement in CI as a ratchet — record the current count, fail the build if it rises. Then burn it down domain by domain alongside the 4.2 extraction.

### 5.4 `daybooks.service.ts` bypasses Drizzle entirely

The 1,832-line daybooks service is written against `sqlite.prepare()` / `sqlite.exec()` raw SQL rather than the Drizzle query builder used everywhere else — a second, parallel data-access idiom with its own migration logic (`daybooks.service.ts:76-87`), its own soft-delete convention (`is_deleted = 0`), and its own audit logging.

To be fair: the SQL itself is defensively written. Values are bound parameters throughout, and sort columns pass through a `safeSort` whitelist before interpolation:

```ts
function safeSort(sortBy, fallback, allowed) {
  return allowed.includes(sortBy) ? sortBy : fallback;
}
```

I checked all 5 `ORDER BY ${...}` interpolations — every one is `safeSort`-guarded. **There is no SQL injection here.** The cost is consistency and type safety, not security: these queries are invisible to the schema, return `any`, and will not break at compile time when a column is renamed.

**Fix:** low priority relative to the rest, but new daybook work should use Drizzle, and the inline `ALTER TABLE` logic at lines 76-87 should move into migrations with the others.

### 5.5 Four controllers bypass the service layer

`auth`, `notifications`, `users`, and `receipts` controllers import `models/storage` directly. `receipts.controller.ts` does so despite `receipts.service.ts` existing. This is a small leak, but it is the kind that spreads by example — and it means business logic for those four domains lives in the HTTP layer, where it cannot be reused by the print mappers or reports.

### 5.6 Global TanStack Query config disables all refetching

[client/src/lib/queryClient.ts:91](client/src/lib/queryClient.ts#L91):

```ts
{ refetchOnWindowFocus: false, staleTime: Infinity, retry: false }
```

Cached data is **never** considered stale and is only refreshed by explicit invalidation. The server compensates with a `res.on("finish")` hook that clears the reports cache on any successful mutation, and correctly adds `Vary: Authorization, Cookie` so responses cannot leak across a user switch — that part is well handled.

But `staleTime: Infinity` means any invalidation the client forgets to fire produces silently stale figures on screen with no recovery path short of a reload. In a single-operator desktop deployment this is defensible; if two clients ever point at one server, users will see divergent balances. `retry: false` also means a single dropped request on a flaky machine surfaces as a hard error.

**Fix:** set a finite `staleTime` (30–60s matches the server's report cache window) and allow `retry: 1`. Reserve `Infinity` for genuinely immutable queries.

---

## 6. Low-Severity / Hygiene

- **Dead directories.** `client/src/store/`, `store/accounts/`, `store/receipts/`, `store/ui/` are empty — leftovers from the rename to `stores/`. Delete them; they currently make `store` vs `stores` imports ambiguous to autocomplete.
- **Uncommitted scratch harnesses.** `script/test-narration.ts`, `test-phase2-narration.ts`, `test-voucher-narration.ts` (1,423 lines) are untracked. Either promote them into the Vitest suite from 3.3 or delete them.
- **Mixed package managers.** `client/bun.lock` was created alongside three committed `package-lock.json` files. Neither `packageManager` nor `engines` is declared in any of the three `package.json` files. Pick one and declare it, or builds will differ between machines.
- **`Updated Build.zip` (294 MB)** sits in the repo root. Correctly gitignored and untracked, so it is clutter rather than a problem — but it is 99.9% of the working directory.
- **Stale audit docs.** `CODEBASE_AUDIT.md` (375 lines) and `CODEBASE_REAUDIT.md` from early August are untracked and unverified against current code. Commit them or remove them; an unversioned audit ages into misinformation.
- **CSP is report-only.** [server/index.ts](server/index.ts) sets `Content-Security-Policy-Report-Only` with a comment saying to enforce once violations are reviewed. Worth closing out — though note `script-src 'unsafe-inline'` will need resolving first.

---

## 7. Recommended Sequence

Ordered so each step de-risks the next. Nothing here requires a rewrite.

**Phase 1 — stop the bleeding (days)**
1. Add `roundMoney(...)` to both balance writers — §4.1.
2. Add the three `ledger_entries` indexes — §4.4.
3. Remove the plaintext password fallback after confirming zero legacy rows — §5.1.
4. Delete the empty `store/` directories, resolve the lockfile split — §6.

**Phase 2 — build the safety net (1–2 weeks)**
5. Install Vitest; write invariant tests for the accounting core — §3.3.
6. Extract `parseAmount` / `roundMoney` / date helpers into `server/utils/money.ts` and route *all* money arithmetic through them, including `daybooks.service.ts` and the print mappers.
7. Generate migration `0000` from current schema, commit `migrations/`, reconcile the 3 orphan tables, switch to `migrate()` — §3.2.

**Phase 3 — fix the desktop build (1 week)**
8. Replace the `npx drizzle-kit push` call with embedded DDL or a shipped seed database — §3.1. **Verify against a genuinely packaged build on a clean machine with no network**, since that is the case that is currently broken and the one dev machines never exercise.

**Phase 4 — structural (ongoing, one domain per PR)**
9. Decide on `repositories/`: finish it or delete it — §4.3.
10. Extract `storage.ts` by bounded context, tests first — §4.2.
11. Unify the print registry on server-side keys — §5.2.
12. Ratchet down `any` in CI — §5.3.

---

## 8. What This Review Did Not Cover

Stated so the gaps are not mistaken for clean bills of health:

- **`electron/` main process** — not read. IPC surface, `contextIsolation`/`nodeIntegration` settings, `webPreferences`, auto-update, and code signing are unexamined. For a desktop app this is a meaningful gap and deserves its own pass.
- **Client component-level review** — `pages/purchases.tsx` (1,291 lines), `settings.tsx` (1,053), and `sales.tsx` (935) were identified by size but not read. Render performance, form state handling, and accessibility are unassessed.
- **The uncommitted working-tree changes** were surveyed for structure (`narration.ts` is clean, focused, and well-documented) but not reviewed line by line for correctness.
- **Dependency vulnerability audit** — no `npm audit` was run.
- **Runtime verification** — the app was not launched. All findings are from static reading plus read-only queries against the 424 KB dev database. The performance claims in §4.4 are reasoned from schema and call sites, not measured under load.
