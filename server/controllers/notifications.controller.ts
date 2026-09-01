import type { Request, Response } from "express";
import { storage } from "../models/storage";
import { getUserId } from "../utils/auth";

export async function listNotifications(req: Request, res: Response) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50;
  const rows = await storage.listNotifications(userId, safeLimit);
  res.json(rows);
}

export async function markNotificationRead(req: Request, res: Response) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid notification id" });
  const ok = await storage.markNotificationRead(id, userId);
  if (!ok) return res.status(404).json({ error: "Notification not found" });
  res.json({ ok: true });
}

export async function markAllNotificationsRead(req: Request, res: Response) {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const count = await storage.markAllNotificationsRead(userId);
  res.json({ ok: true, count });
}
