import type { Request, Response } from "express";
import { z } from "zod";
import { readSettings, writeSettings } from "../services/settings.service";

export async function getSettings(_req: Request, res: Response) {
  try {
    const settings = await readSettings();
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load settings" });
  }
}

export async function saveSettings(req: Request, res: Response) {
  try {
    const saved = await writeSettings(req.body);
    res.json(saved);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to save settings" });
  }
}
