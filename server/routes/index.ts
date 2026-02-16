import type { Express } from "express";
import type { Server } from "http";
import authRoutes from "./auth.routes";
import accountsRoutes from "./accounts.routes";
import cashRoutes from "./cash.routes";
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
import { authenticate, requireAuth } from "../utils/auth";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(authRoutes);
  app.use("/api", authenticate);
  app.use("/api", requireAuth);

  app.use(settingsRoutes);
  app.use(dataManagementRoutes);
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
  app.use(cashRoutes);
  app.use(reportsRoutes);
  app.use(financialRoutes);
  app.use(periodLocksRoutes);
  app.use(fiscalYearRoutes);
  app.use(printRoutes);

  return httpServer;
}
