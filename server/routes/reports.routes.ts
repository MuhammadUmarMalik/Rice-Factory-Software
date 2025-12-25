import { Router } from "express";
import {
  dayBook,
  grossProfit,
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

const router = Router();

router.get("/api/reports/stock", requireRoles(Roles.purchasing), stockReport);
router.get("/api/reports/trial-balance", requireRoles(Roles.finance), trialBalance);
router.get("/api/reports/profit-loss", requireRoles(Roles.finance), profitLoss);
router.get("/api/reports/purchases", requireRoles(Roles.purchasing), purchaseReport);
router.get("/api/reports/sales", requireRoles(Roles.sales), salesReport);
router.get(
  "/api/reports/period-purchases",
  requireRoles(Roles.finance),
  periodPurchases,
);
router.get(
  "/api/reports/period-sales",
  requireRoles(Roles.finance),
  periodSales,
);
router.get(
  "/api/reports/gross-profit",
  requireRoles(Roles.finance),
  grossProfit,
);
router.get(
  "/api/reports/day-book",
  requireRoles(Roles.finance),
  dayBook,
);
router.get(
  "/api/reports/outstanding-customers",
  requireRoles(Roles.finance),
  outstandingCustomers,
);
router.get(
  "/api/reports/outstanding-suppliers",
  requireRoles(Roles.finance),
  outstandingSuppliers,
);
router.get("/api/reports/detail", requireRoles(Roles.finance), reportDetail);

export default router;
