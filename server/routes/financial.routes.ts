import { Router } from "express";
import { balanceSheet, capitalStatement, incomeStatement, salaryStatement } from "../controllers/financial.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get(
  "/api/financial/income-statement",
  requireRoles(Roles.finance),
  incomeStatement,
);
router.get(
  "/api/financial/balance-sheet",
  requireRoles(Roles.finance),
  balanceSheet,
);
router.get(
  "/api/financial/capital",
  requireRoles(Roles.finance),
  capitalStatement,
);
router.get(
  "/api/financial/salary",
  requireRoles(Roles.finance),
  salaryStatement,
);

export default router;
