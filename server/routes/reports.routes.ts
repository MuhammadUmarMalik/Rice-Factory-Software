import { Router, type RequestHandler } from "express";
import {
  bardanaReport,
  dayBook,
  grossProfit,
  lessReport,
  outstandingCustomers,
  outstandingSuppliers,
  periodPurchases,
  periodSales,
  profitLoss,
  purchaseReport,
  reportDetail,
  salesReport,
  stockReport,
  trialBalance,
} from "../controllers/reports.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";
import { cacheResponse } from "../utils/response-cache";

const router = Router();
const reportsCache = cacheResponse({ ttlMs: 30000, keyPrefix: "reports" });

router.get("/api/reports/stock", requireRoles(Roles.purchasing), reportsCache, stockReport);
router.get("/api/reports/trial-balance", requireRoles(Roles.finance), reportsCache, trialBalance);
router.get("/api/reports/profit-loss", requireRoles(Roles.finance), reportsCache, profitLoss);
router.get("/api/reports/purchases", requireRoles(Roles.purchasing), reportsCache, purchaseReport);
router.get("/api/reports/sales", requireRoles(Roles.sales), reportsCache, salesReport);
router.get("/api/reports/bardana", requireRoles(Roles.purchasing), reportsCache, bardanaReport);
router.get("/api/reports/less", requireRoles(Roles.purchasing), reportsCache, lessReport);
router.get(
  "/api/reports/period-purchases",
  requireRoles(Roles.finance),
  reportsCache,
  periodPurchases,
);
router.get(
  "/api/reports/period-sales",
  requireRoles(Roles.finance),
  reportsCache,
  periodSales,
);
router.get(
  "/api/reports/gross-profit",
  requireRoles(Roles.finance),
  reportsCache,
  grossProfit,
);
router.get(
  "/api/reports/day-book",
  requireRoles(Roles.finance),
  reportsCache,
  dayBook,
);
router.get(
  "/api/reports/outstanding-customers",
  requireRoles(Roles.finance),
  reportsCache,
  outstandingCustomers,
);
router.get(
  "/api/reports/outstanding-suppliers",
  requireRoles(Roles.finance),
  reportsCache,
  outstandingSuppliers,
);
// Detail lookup is role-aware: operators who create sales/purchases must be
// able to open those invoices, while accounting/ledger detail stays finance-only.
const reportDetailAuth: RequestHandler = (req, res, next) => {
  const type = (req.query.type as string) || "";
  const roles = type === "sale" ? Roles.sales : type === "purchase" ? Roles.purchasing : Roles.finance;
  return requireRoles(roles)(req, res, next);
};

router.get("/api/reports/detail", reportDetailAuth, reportsCache, reportDetail);

export default router;
