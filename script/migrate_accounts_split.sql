-- Migration: split account profiles into dedicated tables while preserving data
-- Run with: sqlite3 .local/data.db ".read script/migrate_accounts_split.sql"
-- Safe to re-run; uses IF NOT EXISTS / NOT EXISTS guards.

BEGIN TRANSACTION;

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_urdu TEXT,
  phone TEXT,
  address TEXT,
  address_urdu TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

INSERT INTO customers (account_id, name, name_urdu, phone, address, address_urdu, created_at)
SELECT a.id, a.name, a.name_urdu, a.phone, a.address, a.address_urdu, COALESCE(a.created_at, strftime('%s','now'))
FROM accounts a
WHERE a.type = 'customer'
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.account_id = a.id);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_urdu TEXT,
  phone TEXT,
  address TEXT,
  address_urdu TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

INSERT INTO suppliers (account_id, name, name_urdu, phone, address, address_urdu, created_at)
SELECT a.id, a.name, a.name_urdu, a.phone, a.address, a.address_urdu, COALESCE(a.created_at, strftime('%s','now'))
FROM accounts a
WHERE a.type = 'supplier'
  AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.account_id = a.id);

-- Banks
CREATE TABLE IF NOT EXISTS banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_urdu TEXT,
  phone TEXT,
  address TEXT,
  address_urdu TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

INSERT INTO banks (account_id, name, name_urdu, phone, address, address_urdu, created_at)
SELECT a.id, a.name, a.name_urdu, a.phone, a.address, a.address_urdu, COALESCE(a.created_at, strftime('%s','now'))
FROM accounts a
WHERE a.type = 'bank'
  AND NOT EXISTS (SELECT 1 FROM banks b WHERE b.account_id = a.id);

-- Expense Categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_urdu TEXT,
  phone TEXT,
  address TEXT,
  address_urdu TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

INSERT INTO expense_categories (account_id, name, name_urdu, phone, address, address_urdu, created_at)
SELECT a.id, a.name, a.name_urdu, a.phone, a.address, a.address_urdu, COALESCE(a.created_at, strftime('%s','now'))
FROM accounts a
WHERE a.type = 'expense'
  AND NOT EXISTS (SELECT 1 FROM expense_categories e WHERE e.account_id = a.id);

COMMIT;
