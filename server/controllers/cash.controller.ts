import type { Request, Response } from "express";
import { getCashSummary, getCashTransactions } from "../services/cash.service";

export async function getSummary(_req: Request, res: Response) {
  try {
    const summary = await getCashSummary();
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch cash summary" });
  }
}

export async function getTransactions(_req: Request, res: Response) {
  try {
    const tx = await getCashTransactions();
    res.json(tx);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch cash transactions" });
  }
}
