# Mill Manager (Rice Mill ERP)

Mill Manager is a full-stack ERP for rice mills covering procurement, stock processing, sales, accounting, HR/payroll, reporting, and printing. It runs as a web app (React + Express + SQLite) and can be packaged as a Windows desktop app with Electron.

## Overview
- Single repo with `client` (React UI), `server` (Express API), `shared` (schema + print types), and `electron` (desktop wrapper).
- Database is SQLite via Drizzle ORM. Default location is `.local/data.db` (or `APP_DATA_DIR/data.db` for desktop).
- UI is bilingual (English/Urdu) with RTL support and print-ready reports/invoices.

## Key Capabilities
- Operations: purchases, processing batches, inventory, and sales with detailed weight and charge handling.
- Accounting: chart of accounts, ledger, cash transactions, receipts, payments, journal vouchers, and period locks.
- HR/Payroll: employees, salary structures, payroll generation/approval/payment, audit logs.
- Reporting: stock, purchases, sales, trial balance, profit/loss, gross profit, day book, outstanding, financial statements.
- Print/PDF: invoices, vouchers, and reports via HTML preview or PDF generation.
- Desktop: Electron packaging, splash screen, single-instance guard, built-in print preview and PDF export.

## Architecture
```
Client (React + Vite)
  -> /api (Express)
      -> services/controllers
      -> storage (Drizzle ORM)
      -> SQLite database (.local/data.db)
Electron (desktop) wraps server + UI and handles printing
Shared package exposes schema and print payload types
```

## Tech Stack
- Client: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, React Query, Wouter, Zustand, Zod.
- Server: Express, TypeScript (tsx runtime), Drizzle ORM, better-sqlite3, zod-validation-error, helmet, cors, compression, express-session.
- Reporting/Print: Playwright (PDF rendering), server-side HTML templates, print registry/mappers.
- Desktop: Electron, electron-builder, Node.
- Tooling: Tailwind, PostCSS, ESBuild, drizzle-kit.

## Project Structure
```
client/                 React UI
  src/
    app/                App shells (authenticated vs login)
    pages/              Feature pages (dashboard, purchases, sales, reports, etc.)
    components/         Reusable UI, data tables, filters, print UI
    contexts/           Theme and language providers (EN/UR + RTL)
    stores/             Zustand stores by domain
    store/              Legacy stores kept for compatibility
    print/              Client print registry and styles
    lib/                API helpers, i18n, keyboard shortcuts, query client
server/                 Express API and business logic
  controllers/          Request handlers
  routes/               Route definitions and RBAC bindings
  services/             Domain services, print engine, report calculations
  models/               Drizzle DB connection and storage layer
  schemas/              Zod validation schemas
  utils/                Auth, notifications, caching, parsing helpers
  views/                Server-rendered print templates
shared/                 Shared schema and print payload types
electron/               Desktop main/preload processes
script/                 Build, seed, migration, and test scripts
dist/                   Production build output (generated)
dist-desktop/           Electron build output (generated)
.local/                 Local DB + settings (runtime)
design_guidelines.md    UI/UX design system notes
components.json         shadcn UI config
drizzle.config.ts       Drizzle migration config
```

## Functional Modules (UI + API)
### Authentication and Users
- **UI:** Login page, session enforcement, admin user management.
- **API:** `/api/auth/*` and `/api/users/*`.
- **Notes:** Passwords are PBKDF2 hashed and upgraded on login when legacy hashes are detected; sessions + JWT are supported.

### Dashboard
- **UI:** KPIs, charts, recent activity, and alerts.
- **API:** `/api/dashboard/*`.
- **Notes:** KPIs include purchases, sales, stock value, net profit, cash/bank balances, and outstanding totals.

### Accounts (Customers, Suppliers, Banks, Expense Categories)
- **UI:** `/accounts/*` pages for customer/supplier/bank/expense lists and management.
- **API:** `/api/accounts`.
- **Data:** Account types include customer, supplier, bank, expense, asset, liability, equity, income, cogs, salary, employee.

### Products and Inventory
- **UI:** Products list and stock.
- **API:** `/api/products`, `/api/reports/stock`.
- **Data:** Product types support raw/bio, units (kg default), current stock, average purchase price, sale price.

### Purchases (Procurement)
- **UI:** Purchase entry with multi-line items and charges.
- **API:** `/api/purchases` and `/api/purchases/next-bill-number`.
- **Data:** Invoice/bill/book numbers, supplier, broker commission, vehicle, due date, charges add/less, taxes, totals, and amount in words.
- **Items:** Bags, weights (gross/net), mound conversion (40kg or 60kg base), rate units (kg, mound, bag, quintal, ton).

### Processing (Stock Conversion)
- **UI:** Processing batches and status.
- **API:** `/api/processing` plus `/start` and `/complete`.
- **Data:** Batch number, source product/qty, output product/qty/category, wastage, status.

### Sales
- **UI:** Sales invoice entry and listing.
- **API:** `/api/sales`.
- **Data:** Invoice number, gate pass, customer, vehicle, charges (loading/weighing/other), taxes, totals, paid amount.

### Receipts and Payments
- **UI:** Receipts and payments vouchers.
- **API:** `/api/receipts` and `/api/payments`.
- **Data:** Voucher headers + lines; CR for receipts, DR for payments; settlement account; total debit/credit; amount in words.

### Expenses
- **UI:** Expense vouchers.
- **API:** `/api/expenses`.
- **Data:** Expense account, pay-from account, amount, description, date.

### Journal Vouchers
- **UI:** Journal voucher entry and approvals.
- **API:** `/api/journal-vouchers`.
- **Data:** Voucher number/date, status (draft/approved), entries with debit/credit lines.

### Ledger and Cash
- **UI:** Ledger reports and cash view.
- **API:** `/api/ledger`, `/api/cash/summary`, `/api/cash/transactions`.
- **Data:** Ledger entries store running balance and reference links to source transactions.

### HR and Payroll
- **UI:** Employees and payroll screens.
- **API:** `/api/employees`, `/api/payrolls`.
- **Data:** Employee master, salary structures (effective dated), payroll lifecycle (generated, approved, paid), audit logs.

### Reports and Financial Statements
- **UI:** Stock, purchase, sales, period, gross profit, day book, outstanding, trial balance, profit/loss, income statement, balance sheet, capital, salary.
- **API:** `/api/reports/*` and `/api/financial/*`.
- **Notes:** Report endpoints are cached (30s) to reduce recalculation load.

### Settings and Preferences
- **UI:** Company profile, theme, language, shortcuts.
- **API:** `/api/settings`, `/api/settings/summary`, `/api/settings/shortcuts`.
- **Storage:** `settings.json` in `.local/` or `APP_DATA_DIR`.

### Notifications
- **UI:** Notification dropdown and unread count.
- **API:** `/api/notifications`.
- **Notes:** Low stock alerts are generated when `currentStock <= LOW_STOCK_THRESHOLD`.

### Printing and Export
- **UI:** Print preview page and export controls.
- **API:** `/api/print/preview`, `/api/print/pdf`.
- **Docs:** Invoices, vouchers, stock and financial reports, statements (see Print Doc Keys below).

## Database Schema (SQLite via Drizzle)
The schema is defined in `shared/schema.ts`. All money/quantity fields are stored as strings for precision and formatted at the UI layer.

| Table | Purpose |
| --- | --- |
| users | Application users with roles and login credentials. |
| notifications | User-facing notifications (low stock, vouchers, etc). |
| accounts | Chart of accounts and parties (customers, suppliers, banks, expense categories, system accounts). |
| fiscal_years | Fiscal year headers (name, start/end, status). |
| fiscal_periods | Monthly periods within fiscal years with close status. |
| fiscal_opening_balances | Opening balances per account/fiscal year. |
| tax_types | Tax configuration (GST, WHT, etc). |
| tax_rates | Tax rates by effective date. |
| tax_ledgers | Transaction-level tax postings. |
| employees | Employee master data. |
| employee_salary_structures | Effective-dated salary breakdowns. |
| payrolls | Payroll records and lifecycle status. |
| payroll_audit_logs | Payroll audit trail (generated/approved/paid). |
| products | Product catalog and stock snapshots. |
| purchases | Purchase invoices and totals. |
| purchase_items | Purchase line items with weights and rates. |
| purchase_charges | Additional purchase charges (freight, loading, brokerage, etc). |
| processing | Stock processing batches and outputs. |
| sales | Sales invoices and totals. |
| sale_items | Sales line items. |
| ledger_entries | Ledger postings with running balance. |
| receipt_vouchers | Receipt and payment voucher headers. |
| receipt_voucher_lines | Voucher line items with debit/credit splits. |
| journal_vouchers | Journal voucher headers (draft/approved). |
| journal_voucher_entries | Journal voucher lines. |
| cash_transactions | Cash book movements and narration. |
| period_locks | Posting locks by date range. |
| contra_vouchers | Cash/bank contra voucher headers. |
| contra_voucher_lines | Contra voucher debit/credit splits. |
| asset_categories | Fixed asset categories and depreciation rules. |
| fixed_assets | Fixed asset register. |
| asset_depreciation_runs | Monthly depreciation postings. |
| bank_statements | Bank statement headers. |
| bank_statement_lines | Bank statement line items. |
| bank_reconciliation_items | Ledger vs bank matching status. |
| invoice_allocations | Settlement allocations for AR/AP. |
| audit_logs | General audit trail for creates/updates/deletes. |
| budgets | Budget headers (phase 1). |
| budget_lines | Budget lines per period and account. |
| expense_entries | Expense voucher entries. |

Note: Some schema areas (fixed assets, budgeting, bank reconciliation) are present in the data model but not fully surfaced in routes/UI yet.

## API Overview (Routes)
Auth and Users
- POST `/api/auth/login`
- POST `/api/auth/logout`
- GET `/api/auth/me`
- POST `/api/auth/bootstrap`
- GET `/api/users`
- POST `/api/users`
- PATCH `/api/users/:id`

Dashboard
- GET `/api/dashboard/stats`
- GET `/api/dashboard/recent`
- GET `/api/dashboard/charts`
- GET `/api/dashboard/summary`
- GET `/api/dashboard/alerts`

Accounts
- GET `/api/accounts`
- GET `/api/accounts/:id`
- POST `/api/accounts`
- PATCH `/api/accounts/:id`
- DELETE `/api/accounts/:id`

Products
- GET `/api/products`
- GET `/api/products/:id`
- POST `/api/products`
- PATCH `/api/products/:id`
- DELETE `/api/products/:id`

Purchases
- GET `/api/purchases/next-bill-number`
- GET `/api/purchases`
- GET `/api/purchases/:id`
- POST `/api/purchases`
- PATCH `/api/purchases/:id`
- DELETE `/api/purchases/:id`

Processing
- GET `/api/processing`
- GET `/api/processing/:id`
- POST `/api/processing`
- PATCH `/api/processing/:id`
- PATCH `/api/processing/:id/start`
- PATCH `/api/processing/:id/complete`

Sales
- GET `/api/sales`
- GET `/api/sales/:id`
- POST `/api/sales`
- PATCH `/api/sales/:id`
- DELETE `/api/sales/:id`

Receipts and Payments
- GET `/api/receipts`
- GET `/api/receipts/next-number`
- GET `/api/receipts/:id`
- POST `/api/receipts`
- PATCH `/api/receipts/:id`
- DELETE `/api/receipts/:id`
- GET `/api/payments`
- GET `/api/payments/next-number`
- GET `/api/payments/:id`
- POST `/api/payments`
- PATCH `/api/payments/:id`
- DELETE `/api/payments/:id`

Expenses
- GET `/api/expenses`
- POST `/api/expenses`
- PATCH `/api/expenses/:id`
- DELETE `/api/expenses/:id`

Journal Vouchers
- GET `/api/journal-vouchers`
- GET `/api/journal-vouchers/next-number`
- GET `/api/journal-vouchers/:id`
- POST `/api/journal-vouchers`
- PATCH `/api/journal-vouchers/:id`
- POST `/api/journal-vouchers/:id/approve`
- DELETE `/api/journal-vouchers/:id`

Ledger and Cash
- GET `/api/ledger`
- GET `/api/cash/summary`
- GET `/api/cash/transactions`

Employees and Payroll
- GET `/api/employees`
- GET `/api/employees/:id`
- POST `/api/employees`
- PATCH `/api/employees/:id`
- GET `/api/employees/:id/salary-structures`
- POST `/api/employees/:id/salary-structures`
- PATCH `/api/employees/:id/salary-structures/:structureId`
- DELETE `/api/employees/:id/salary-structures/:structureId`
- GET `/api/payrolls`
- POST `/api/payrolls/generate`
- POST `/api/payrolls/:id/approve`
- POST `/api/payrolls/:id/pay`
- GET `/api/payrolls/:id/audit`

Reports and Financials
- GET `/api/reports/stock`
- GET `/api/reports/trial-balance`
- GET `/api/reports/profit-loss`
- GET `/api/reports/purchases`
- GET `/api/reports/sales`
- GET `/api/reports/period-purchases`
- GET `/api/reports/period-sales`
- GET `/api/reports/gross-profit`
- GET `/api/reports/day-book`
- GET `/api/reports/outstanding-customers`
- GET `/api/reports/outstanding-suppliers`
- GET `/api/reports/detail`
- GET `/api/financial/income-statement`
- GET `/api/financial/balance-sheet`
- GET `/api/financial/capital`
- GET `/api/financial/salary`

Settings and System
- GET `/api/settings`
- GET `/api/settings/summary`
- GET `/api/settings/shortcuts`
- POST `/api/settings`
- GET `/api/notifications`
- POST `/api/notifications/read-all`
- PATCH `/api/notifications/:id/read`
- POST `/api/print/preview`
- POST `/api/print/pdf`
- GET `/api/period-locks`
- POST `/api/period-locks`
- DELETE `/api/period-locks/:id`

## Printing and PDF
- Print payloads are defined in `shared/print.ts`.
- Server print registry is in `server/services/print/registry.ts`.
- PDFs are rendered via Playwright Chromium in `server/services/print/pdf/engine.ts`.
- Electron adds print preview windows and direct printing via IPC.

Print Doc Keys
- invoice.sales, invoice.purchase
- voucher.cashReceipt, voucher.cashPayment, voucher.journal
- report.stock, report.purchases, report.sales, report.periodPurchases, report.periodSales, report.grossProfit, report.dayBook, report.outstandingCustomers, report.outstandingSuppliers, report.ledger, report.trialBalance, report.salary
- statement.balanceSheet, statement.incomeStatement, statement.profitLoss, statement.capital

## Configuration Files and Local Data
- `.local/data.db` default SQLite database (set `DATABASE_URL` or `APP_DATA_DIR` to override).
- `.local/settings.json` app settings (company profile, theme, language, shortcuts).
- `.local/seed.db` optional desktop seed database (generated by `script/prepare-seed-db.ts`).
- `.local/secrets.json` desktop-only session secret storage.
- `design_guidelines.md` UI/UX design guidelines and layout rules.
- `components.json` shadcn UI configuration.
- `tailwind.config.ts` and `client/src/index.css` theme and styling.
- `drizzle.config.ts` migration config (SQLite dialect).

## Environment Variables
- `NODE_ENV` (production enables static serving and strict secrets).
- `PORT` (default 5000).
- `DATABASE_URL` (SQLite file path, supports `file:` prefix).
- `APP_DATA_DIR` (desktop data root; stores DB and settings).
- `SESSION_SECRET` / `JWT_SECRET` (required in production; used for sessions/JWT).
- `FORCE_HTTPS` (if "true", redirects HTTP to HTTPS in production).
- `CORS_ORIGIN` (comma-separated list of allowed origins).
- `LOW_STOCK_THRESHOLD` (default 10).
- `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_PASSWORD`, `DEFAULT_ADMIN_FULLNAME` (desktop bootstrap).
- `DEFAULT_ADMIN_NAME` (script seed admin name).
- `DESKTOP_BUILD` (set to "1" inside Electron packaged app).
- `SERVER_WAIT_TIMEOUT_MS` (Electron startup timeout, default 90000).
- `DISABLE_GPU` ("true" disables GPU in Electron).
- `REPL_ID` (enables Replit dev plugins in Vite).

## Development Setup
```bash
npm install
npm run dev
```
The server and client run on the same port (default `5000`). Vite is mounted as middleware in development.

Optional database setup
```bash
npm run db:push
```

Seed a default admin (for local web mode)
```bash
npm run db:seed
```

## Build and Run (Production)
```bash
npm run build
npm run start
```
Build produces:
- `dist/public` for the client.
- `dist/index.cjs` for the server.

## Desktop Build (Electron)
```bash
npm run electron:build
```
Notes:
- `script/prepare-seed-db.ts` creates `.local/seed.db` for first-run data.
- Electron starts the Express server, waits for readiness, then loads the UI.
- Output goes to `dist-desktop/`.

## Scripts
- `dev`: Start server in dev mode with Vite middleware.
- `build`: Build client + server (Vite + ESBuild).
- `start`: Run server from `dist/index.cjs`.
- `check`: TypeScript typecheck.
- `db:push`: Drizzle schema push.
- `db:seed`: Create default admin if none exists.
- `test`: Run report calculation tests.
- `electron:dev`: Run server and Electron side-by-side.
- `electron:build`: Build and package desktop app.

Scripts in `script/`
- `build.ts`: Client + server build orchestration.
- `prepare-seed-db.ts`: Create a clean seed database for desktop.
- `seed-admin.ts`: Create initial admin user.
- `test-reports.ts`: Unit tests for report calculations.
- `migrate_accounts_split.sql`: Optional migration to split account profiles.
- `report_indexes.sql`: Optional indexes for report performance.
- `clean-desktop.js`: Clears the desktop build output directory.

## Security Notes
- Sessions are stored in-memory (memorystore) and JWT tokens are issued on login.
- Rate limits: `/api/auth/login` and `/api/auth/bootstrap` are throttled.
- Helmet, compression, and cache control headers are enabled.
- Production requires `SESSION_SECRET` or `JWT_SECRET`.

## Localization and UX
- English and Urdu translations are in `client/src/lib/i18n.ts`.
- RTL is enabled automatically for Urdu and fonts load on demand.
- Default keyboard shortcuts: Ctrl+B (toggle sidebar), Ctrl+P (print preview), Ctrl+Shift+P (download PDF), Ctrl+N (new dialog), Ctrl+Enter (save dialog), Ctrl+Shift+N (add line).

## Troubleshooting
- If production throws "SESSION_SECRET or JWT_SECRET must be set", set one of them.
- If Electron fails with "Missing seed database", create `.local/seed.db` with `npm run electron:build` or `tsx script/prepare-seed-db.ts`.
- If port 5000 is busy, the server will increment ports automatically (up to 5 retries).

## License
MIT (see `package.json`).
