import type { Request, Response } from "express";
import { getDashboardCharts, getDashboardStats, getRecentActivity } from "../services/dashboard.service";

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

export async function getCharts(_req: Request, res: Response) {
  try {
    const charts = await getDashboardCharts();
    res.json(charts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
}
