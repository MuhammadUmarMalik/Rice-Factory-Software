import { Router } from "express";
import {
  approvePayroll,
  deletePayroll,
  generatePayroll,
  getPayroll,
  getPayrollAudit,
  listPayrolls,
  paySalary,
  updatePayroll,
} from "../controllers/payroll.controller";
import { requireRoles } from "../utils/auth";

const router = Router();

router.get(
  "/api/payrolls",
  requireRoles(["admin", "manager", "hr", "accountant"]),
  listPayrolls,
);
router.get(
  "/api/payrolls/:id",
  requireRoles(["admin", "manager", "hr", "accountant"]),
  getPayroll,
);
router.post(
  "/api/payrolls/generate",
  requireRoles(["admin", "manager", "hr", "accountant"]),
  generatePayroll,
);
router.patch(
  "/api/payrolls/:id",
  requireRoles(["admin", "manager", "hr", "accountant"]),
  updatePayroll,
);
router.delete(
  "/api/payrolls/:id",
  requireRoles(["admin", "manager", "hr", "accountant"]),
  deletePayroll,
);
router.post(
  "/api/payrolls/:id/approve",
  requireRoles(["admin", "manager"]),
  approvePayroll,
);
router.post("/api/payrolls/:id/pay", requireRoles(["admin", "accountant"]), paySalary);
router.get(
  "/api/payrolls/:id/audit",
  requireRoles(["admin", "manager", "hr", "accountant"]),
  getPayrollAudit,
);

export default router;
