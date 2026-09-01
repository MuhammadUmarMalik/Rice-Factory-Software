import type { Request, Response } from "express";
import { z } from "zod";
import { getAppVersion } from "../utils/app-info";
import {
  getDataSummary,
  importJsonBackup,
  streamJsonBackup,
  streamSqlBackup,
  type BackupPayload,
} from "../services/data-management.service";

const backupSchema: z.ZodType<BackupPayload> = z.object({
  meta: z.object({
    formatVersion: z.number(),
    exportedAt: z.string(),
    appVersion: z.string().optional(),
    dbUserVersion: z.number().optional(),
  }),
  tables: z.record(z.array(z.record(z.any()))),
});

const importSchema = z.object({
  mode: z.enum(["replace", "merge"]),
  data: backupSchema,
});

export async function getDataSummaryHandler(_req: Request, res: Response) {
  try {
    const summary = getDataSummary();
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load data summary" });
  }
}

export async function exportDatabaseHandler(req: Request, res: Response) {
  try {
    const format = (req.query.format as string | undefined) || "json";
    const appVersion = getAppVersion();
    if (format === "sql") {
      return streamSqlBackup(res, appVersion);
    }
    return streamJsonBackup(res, appVersion);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to export database" });
  }
}

export async function importDatabaseHandler(req: Request, res: Response) {
  try {
    const parsed = importSchema.parse(req.body);
    const result = importJsonBackup(parsed.data, parsed.mode);
    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid backup format", details: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to import database" });
  }
}

export async function getAppVersionHandler(_req: Request, res: Response) {
  try {
    res.json({ version: getAppVersion() || "unknown" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load app version" });
  }
}
