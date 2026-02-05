import type { Request, Response } from "express";
import { parseOptionalDate } from "../utils/parse";
import { getDashboardAlerts, getDashboardCharts, getDashboardSummary, getDashboardStats, getRecentActivity } from "../services/dashboard.service";

export async function getStats(_req: Request, res: Response) {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
}

export async function getRecent(_req: Request, res: Response) {
  try {
    const activities = await getRecentActivity();
    res.json(activities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch recent activity" });
  }
}

export async function getCharts(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const charts = await getDashboardCharts({ fromDate, toDate });
    res.json(charts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
}

export async function getSummary(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const scopeParam = typeof req.query.scope === "string" ? req.query.scope : "full";
    const scope = scopeParam === "core" || scopeParam === "details" ? scopeParam : "full";
    const summary = await getDashboardSummary({ fromDate, toDate }, scope);
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
}

export async function getAlerts(req: Request, res: Response) {
  try {
    const fromDate = parseOptionalDate(req.query.fromDate);
    const toDate = parseOptionalDate(req.query.toDate);
    const alerts = await getDashboardAlerts({ fromDate, toDate });
    res.json(alerts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch dashboard alerts" });
  }
}
