import type { Request, Response } from "express";
import { renderPrintPreview, renderPrintPdf } from "../services/print.service";
import { getUserId, getUserRole } from "../utils/auth";

export async function previewHandler(req: Request, res: Response) {
  try {
    const result = await renderPrintPreview(req.body, {
      role: getUserRole(req),
      userId: getUserId(req),
      userLabel: getUserRole(req),
    });
    res.json({ html: result.html, payload: result.payload });
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : error?.name === "ZodError" ? 400 : 500;
    res.status(status).json({ error: status === 500 ? "Failed to render preview" : error?.message });
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
    const status = error?.status === 403 ? 403 : error?.name === "ZodError" ? 400 : 500;
    res.status(status).json({ error: status === 500 ? "Failed to generate PDF" : error?.message });
  }
}
