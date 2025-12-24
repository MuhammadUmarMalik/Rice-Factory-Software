import { Router } from "express";
import { balanceSheet, capitalStatement, incomeStatement, salaryStatement } from "../controllers/financial.controller";
import { requireRoles } from "../utils/auth";

const router = Router();

router.get(
  "/api/financial/income-statement",
  requireRoles(["admin", "manager", "accountant"]),
  incomeStatement,
);
router.get(
  "/api/financial/balance-sheet",
  requireRoles(["admin", "manager", "accountant"]),
  balanceSheet,
);
router.get(
  "/api/financial/capital",
  requireRoles(["admin", "manager", "accountant"]),
  capitalStatement,
);
router.get(
  "/api/financial/salary",
  requireRoles(["admin", "manager", "accountant"]),
  salaryStatement,
);

export default router;
