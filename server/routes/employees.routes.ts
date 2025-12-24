import { Router } from "express";
import {
  createEmployee,
  createSalaryStructure,
  getEmployee,
  getSalaryStructures,
  listEmployees,
  updateEmployee,
} from "../controllers/employees.controller";
import { requireRoles } from "../utils/auth";

const router = Router();

router.get(
  "/api/employees",
  requireRoles(["admin", "manager", "hr", "accountant", "operator"]),
  listEmployees,
);
router.get(
  "/api/employees/:id",
  requireRoles(["admin", "manager", "hr", "accountant", "operator"]),
  getEmployee,
);
router.post("/api/employees", requireRoles(["admin", "manager", "hr", "operator"]), createEmployee);
router.patch("/api/employees/:id", requireRoles(["admin", "manager", "hr", "operator"]), updateEmployee);
router.get(
  "/api/employees/:id/salary-structures",
  requireRoles(["admin", "manager", "hr", "accountant"]),
  getSalaryStructures,
);
router.post(
  "/api/employees/:id/salary-structures",
  requireRoles(["admin", "manager", "hr"]),
  createSalaryStructure,
);

export default router;
