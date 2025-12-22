import type { Express } from "express";
import { previewHandler, pdfHandler } from "./print.controller";

function getUserRole(req: any): string {
  const role = (req.headers?.["x-user-role"] as string | undefined) || "";
  return role.toLowerCase() || "operator";
}

function requireRoles(allowed: string[]) {
  const allow = allowed.map((r) => r.toLowerCase());
  return (req: any, res: any, next: any) => {
    const role = getUserRole(req);
    if (!allow.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function registerPrintRoutes(app: Express) {
  const allowed = ["admin", "manager", "accountant", "operator", "hr"];
  app.post("/api/print/preview", requireRoles(allowed), previewHandler);
  app.post("/api/print/pdf", requireRoles(allowed), pdfHandler);
}

