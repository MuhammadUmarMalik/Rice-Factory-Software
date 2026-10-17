import type { Request, Response } from "express";
import { renderPrintPreview, renderPrintPdf } from "../services/print.service";
import { getUserId, getUserRole } from "../utils/auth";
import * as usersModel from "../models/users.model";

/**
 * The PDF prints a "Prepared By" line, and the name on it must read the way the
 * person is known - their full name - not their login username. Falls back to
 * the role only when the user record is missing or has no name at all.
 */
async function resolvePrintUserLabel(req: Request): Promise<string> {
  const fromReq = req.user?.fullName?.trim();
  if (fromReq) return fromReq;

  const userId = getUserId(req);
  if (userId) {
    try {
      const user = await usersModel.getUser(userId);
      if (user?.fullName?.trim()) return user.fullName.trim();
      if (user?.username?.trim()) return user.username.trim();
    } catch (error) {
      console.error("[print] Failed to resolve user name:", error);
    }
  }
  return getUserRole(req);
}

export async function previewHandler(req: Request, res: Response) {
  try {
    const result = await renderPrintPreview(req.body, {
      role: getUserRole(req),
      userId: getUserId(req),
      userLabel: await resolvePrintUserLabel(req),
    });
    res.json({ html: result.html, payload: result.payload });
  } catch (error: any) {
    console.error("[print.preview] Error:", error?.message, error?.stack);
    const status = error?.status === 403 ? 403 : error?.name === "ZodError" ? 400 : 500;
    res.status(status).json({
      error: status === 500 ? "Failed to render preview" : error?.message,
      detail: status === 500 ? error?.message : undefined,
    });
  }
}

export async function pdfHandler(req: Request, res: Response) {
  try {
    const pdf = await renderPrintPdf(req.body, {
      role: getUserRole(req),
      userId: getUserId(req),
      userLabel: await resolvePrintUserLabel(req),
    });
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdf);
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : error?.name === "ZodError" ? 400 : 500;
    res.status(status).json({ error: status === 500 ? "Failed to generate PDF" : error?.message });
  }
}
