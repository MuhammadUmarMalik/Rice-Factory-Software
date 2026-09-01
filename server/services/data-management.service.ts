import Database from "better-sqlite3";
import fs from "fs";
import { resolvedDbPath } from "../models/db";

export type BackupMeta = {
  formatVersion: number;
  exportedAt: string;
  appVersion?: string;
  dbUserVersion?: number;
};

export type BackupPayload = {
  meta: BackupMeta;
  tables: Record<string, Array<Record<string, unknown>>>;
};

export type TableSummary = {
  name: string;
  count: number;
};

export type DataSummary = {
  tables: TableSummary[];
  totalRows: number;
  sizeBytes: number;
  updatedAt: string;
  dbUserVersion: number;
};

const EXCLUDED_TABLES = new Set(["sqlite_sequence", "drizzle_migrations"]);

function openDatabase() {
  return new Database(resolvedDbPath, { readonly: false });
}

function listTables(db: Database.Database) {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name).filter((name) => !EXCLUDED_TABLES.has(name));
}

function getDbUserVersion(db: Database.Database) {
  try {
    return db.pragma("user_version", { simple: true }) as number;
  } catch {
    return 0;
  }
}

export function getDataSummary(): DataSummary {
  const db = openDatabase();
  try {
    const tables = listTables(db);
    const summaries = tables.map((name) => {
      const row = db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get() as { count: number };
      return { name, count: Number(row?.count || 0) };
    });
    const totalRows = summaries.reduce((sum, item) => sum + item.count, 0);
    const stats = fs.existsSync(resolvedDbPath) ? fs.statSync(resolvedDbPath) : null;
    return {
      tables: summaries,
      totalRows,
      sizeBytes: stats ? stats.size : 0,
      updatedAt: stats ? stats.mtime.toISOString() : new Date().toISOString(),
      dbUserVersion: getDbUserVersion(db),
    };
  } finally {
    db.close();
  }
}

export function streamJsonBackup(res: any, appVersion?: string) {
  const db = openDatabase();
  const exportTime = new Date();
  const tables = listTables(db);
  const meta: BackupMeta = {
    formatVersion: 1,
    exportedAt: exportTime.toISOString(),
    appVersion,
    dbUserVersion: getDbUserVersion(db),
  };

  const filename = buildFilename("json", exportTime);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  try {
    res.write(`{"meta":${JSON.stringify(meta)},"tables":{`);
    tables.forEach((table, index) => {
      res.write(`${index ? "," : ""}${JSON.stringify(table)}:[`);
      const stmt = db.prepare(`SELECT * FROM "${table}"`);
      let firstRow = true;
      for (const row of stmt.iterate()) {
        const payload = JSON.stringify(row);
        res.write(firstRow ? payload : `,${payload}`);
        firstRow = false;
      }
      res.write("]");
    });
    res.write("}}");
    res.end();
  } finally {
    db.close();
  }
}

function sqlValue(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

export function streamSqlBackup(res: any, appVersion?: string) {
  const db = openDatabase();
  const exportTime = new Date();
  const tables = listTables(db);
  const filename = buildFilename("sql", exportTime);

  res.setHeader("Content-Type", "text/sql; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  try {
    res.write("-- Mill Manager SQL Backup\n");
    res.write(`-- Exported: ${exportTime.toISOString()}\n`);
    if (appVersion) {
      res.write(`-- App Version: ${appVersion}\n`);
    }
    res.write("BEGIN TRANSACTION;\n");

    const createStatements = db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string; sql: string }>;

    createStatements
      .filter((row) => row.sql && !EXCLUDED_TABLES.has(row.name))
      .forEach((row) => {
        res.write(`${row.sql};\n`);
      });

    tables.forEach((table) => {
      const rows = db.prepare(`SELECT * FROM "${table}"`).iterate();
      const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
      const columnNames = columns.map((col) => `"${col.name}"`).join(", ");
      for (const row of rows) {
        const values = columns.map((col) => sqlValue((row as any)[col.name])).join(", ");
        res.write(`INSERT INTO "${table}" (${columnNames}) VALUES (${values});\n`);
      }
    });

    res.write("COMMIT;\n");
    res.end();
  } finally {
    db.close();
  }
}

export function importJsonBackup(payload: BackupPayload, mode: "replace" | "merge") {
  const db = openDatabase();
  const tables = listTables(db);
  const importTables = Object.keys(payload.tables || {}).filter((name) => tables.includes(name));
  const importedTables: Array<{ name: string; rows: number }> = [];

  const transaction = db.transaction(() => {
    db.pragma("foreign_keys = OFF");

    if (mode === "replace") {
      importTables.forEach((table) => {
        db.prepare(`DELETE FROM "${table}"`).run();
      });
    }

    importTables.forEach((table) => {
      const rows = payload.tables[table] || [];
      if (rows.length === 0) {
        importedTables.push({ name: table, rows: 0 });
        return;
      }

      const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>;
      const columnNames = columns.map((col) => col.name);

      const firstRow = rows[0] || {};
      const insertColumns = columnNames.filter((col) => Object.prototype.hasOwnProperty.call(firstRow, col));
      const safeColumns = insertColumns.length > 0 ? insertColumns : columnNames;

      const quotedColumns = safeColumns.map((col) => `"${col}"`).join(", ");
      const placeholders = safeColumns.map(() => "?").join(", ");
      const insertSql = `INSERT ${mode === "merge" ? "OR IGNORE " : ""}INTO "${table}" (${quotedColumns}) VALUES (${placeholders})`;
      const stmt = db.prepare(insertSql);

      let rowCount = 0;
      for (const row of rows) {
        const values = safeColumns.map((col) => {
          const value = (row as any)[col];
          return value === undefined ? null : value;
        });
        stmt.run(values);
        rowCount += 1;
      }

      importedTables.push({ name: table, rows: rowCount });
    });

    db.pragma("foreign_keys = ON");
  });

  try {
    transaction();
    return {
      mode,
      importedTables,
      totalRows: importedTables.reduce((sum, table) => sum + table.rows, 0),
      dbUserVersion: getDbUserVersion(db),
    };
  } finally {
    try {
      db.pragma("foreign_keys = ON");
    } catch {
      // ignore
    }
    db.close();
  }
}

function buildFilename(ext: "json" | "sql", date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours(),
  )}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `app_backup_${stamp}.${ext}`;
}
