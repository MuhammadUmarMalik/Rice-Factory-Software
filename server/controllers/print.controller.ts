import type { Request, Response } from "express";
import { renderPrintPreview, renderPrintPdf } from "../services/print.service";
import { getUserId, getUserRole } from "../utils/auth";

export async function previewHandler(req: Request, res: Response) {
  try {
    const html = await renderPrintPreview(req.body, {
      role: getUserRole(req),
      userId: getUserId(req),
      userLabel: getUserRole(req),
    });
    res.json({ html: html.html });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Failed to render preview" });
  }
}

export async function pdfHandler(req: Request, res: Response) {
  try {
    const pdf = await renderPrintPdf(req.body, {
      role: getUserRole(req),
      userId: getUserId(req),
      userLabel: getUserRole(req),
    });
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdf);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Failed to generate PDF" });
  }
}
