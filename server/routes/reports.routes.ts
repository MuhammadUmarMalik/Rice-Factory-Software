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

const router = Router();

router.get("/api/reports/stock", stockReport);
router.get("/api/reports/trial-balance", trialBalance);
router.get("/api/reports/profit-loss", profitLoss);
router.get("/api/reports/purchases", purchaseReport);
router.get("/api/reports/sales", salesReport);
router.get(
  "/api/reports/period-purchases",
  requireRoles(["admin", "manager", "accountant"]),
  periodPurchases,
);
router.get(
  "/api/reports/period-sales",
  requireRoles(["admin", "manager", "accountant"]),
  periodSales,
);
router.get(
  "/api/reports/gross-profit",
  requireRoles(["admin", "manager", "accountant"]),
  grossProfit,
);
router.get(
  "/api/reports/day-book",
  requireRoles(["admin", "manager", "accountant"]),
  dayBook,
);
router.get(
  "/api/reports/outstanding-customers",
  requireRoles(["admin", "manager", "accountant"]),
  outstandingCustomers,
);
router.get(
  "/api/reports/outstanding-suppliers",
  requireRoles(["admin", "manager", "accountant"]),
  outstandingSuppliers,
);
router.get("/api/reports/detail", reportDetail);

export default router;
