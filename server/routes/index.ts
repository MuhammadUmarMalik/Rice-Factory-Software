import type { Express } from "express";
import type { Server } from "http";
import authRoutes from "./auth.routes";
import accountsRoutes from "./accounts.routes";
import cashInHandRoutes from "./cash-in-hand.routes";
import dashboardRoutes from "./dashboard.routes";
import employeesRoutes from "./employees.routes";
import expensesRoutes from "./expenses.routes";
import financialRoutes from "./financial.routes";
import journalVoucherRoutes from "./journal-vouchers.routes";
import ledgerRoutes from "./ledger.routes";
import paymentsRoutes from "./payments.routes";
import payrollRoutes from "./payroll.routes";
import periodLocksRoutes from "./period-locks.routes";
import fiscalYearRoutes from "./fiscal-years.routes";
import processingRoutes from "./processing.routes";
import productsRoutes from "./products.routes";
import purchasesRoutes from "./purchases.routes";
import receiptsRoutes from "./receipts.routes";
import reportsRoutes from "./reports.routes";
import salesRoutes from "./sales.routes";
import settingsRoutes from "./settings.routes";
import printRoutes from "./print.routes";
import usersRoutes from "./users.routes";
import notificationsRoutes from "./notifications.routes";
import dataManagementRoutes from "./data-management.routes";
import daybooksRoutes from "./daybooks.routes";
import { authenticate, requireAuth } from "../utils/auth";
import { invalidateCache } from "../utils/response-cache";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(authRoutes);
  app.use("/api", authenticate);
  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.headers.authorization) return next();
    if (req.get("X-Requested-With") !== "Mill-Manager") {
      return res.status(403).json({ error: "Missing CSRF protection header" });
    }
    const fetchSite = req.get("Sec-Fetch-Site");
    if (fetchSite === "cross-site") return res.status(403).json({ error: "Cross-site request blocked" });
    return next();
  });
  app.use("/api", requireAuth);

  // Any successful state-changing request can affect report data, so the
  // 30s report response cache must be invalidated on mutations.
  app.use("/api", (req, res, next) => {
    res.on("finish", () => {
      if (req.method !== "GET" && res.statusCode >= 200 && res.statusCode < 300) {
        invalidateCache("reports");
      }
    });
    next();
  });

  app.use(settingsRoutes);
  app.use(dataManagementRoutes);
  app.use(daybooksRoutes);
  app.use(dashboardRoutes);
  app.use(usersRoutes);
  app.use(notificationsRoutes);
  app.use(accountsRoutes);
  app.use(expensesRoutes);
  app.use(employeesRoutes);
  app.use(payrollRoutes);
  app.use(productsRoutes);
  app.use(purchasesRoutes);
  app.use(receiptsRoutes);
  app.use(paymentsRoutes);
  app.use(journalVoucherRoutes);
  app.use(processingRoutes);
  app.use(salesRoutes);
  app.use(ledgerRoutes);
  app.use(cashInHandRoutes);
  app.use(reportsRoutes);
  app.use(financialRoutes);
  app.use(periodLocksRoutes);
  app.use(fiscalYearRoutes);
  app.use(printRoutes);

  return httpServer;
}
